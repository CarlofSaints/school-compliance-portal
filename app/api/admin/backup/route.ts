import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";
import JSZip from "jszip";
import { requirePermission } from "@/lib/rolesData";
import { branding } from "@/lib/branding";

// Tenant-scoped, the same rule lib/controlData.ts writes under. This route is
// the ONLY other place that talks to @vercel/blob directly, which is how it was
// missed: a literal "hvps/" here listed nothing at all on Jeppe, so Backup
// answered "No data found to backup" on every school except HVPS.
const PREFIX = `${branding.key}/`;

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico"];

function isImagePath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "manage_users");
  if (auth instanceof NextResponse) return auth;

  try {
    // Enumerate all blobs with pagination
    const allBlobs: { pathname: string; url: string }[] = [];
    let cursor: string | undefined;

    do {
      const result = await list({
        prefix: PREFIX,
        limit: 1000,
        cursor,
      });
      for (const blob of result.blobs) {
        allBlobs.push({ pathname: blob.pathname, url: blob.url });
      }
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);

    if (allBlobs.length === 0) {
      return NextResponse.json({ error: "No data found to backup" }, { status: 404 });
    }

    // Build ZIP
    const zip = new JSZip();

    for (const blob of allBlobs) {
      try {
        const res = await fetch(blob.url, {
          headers: {
            Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
          },
          cache: "no-store",
        });

        if (!res.ok) {
          console.warn(`Skipping blob ${blob.pathname}: fetch returned ${res.status}`);
          continue;
        }

        // Strip the prefix so ZIP paths are clean (e.g. "roles.json" not "hvps/roles.json")
        const zipPath = blob.pathname.startsWith(PREFIX)
          ? blob.pathname.slice(PREFIX.length)
          : blob.pathname;

        if (isImagePath(blob.pathname)) {
          const buffer = await res.arrayBuffer();
          zip.file(zipPath, buffer);
        } else {
          const text = await res.text();
          zip.file(zipPath, text);
        }
      } catch (err) {
        console.warn(`Skipping blob ${blob.pathname}: ${err}`);
        continue;
      }
    }

    const zipBuffer = Buffer.from(await zip.generateAsync({ type: "uint8array" }));

    const today = new Date().toISOString().slice(0, 10);
    const filename = `${branding.key}-backup-${today}.zip`;

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Backup failed:", err);
    return NextResponse.json(
      { error: "Backup failed" },
      { status: 500 }
    );
  }
}

export const maxDuration = 120;
