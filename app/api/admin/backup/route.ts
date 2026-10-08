import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";
import JSZip from "jszip";
import { requirePermission } from "@/lib/rolesData";
import { tenantScope } from "@/lib/tenantContext";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { contentDisposition } from "@/lib/contentDisposition";

// The zip holds EVERYTHING: every user's password hash, every document. That
// is far more than running the user list, so it is gated on manage_roles (the
// Super Admin's key) rather than manage_users, which SGB Admins hold.
const BACKUP_PERMISSION = "manage_roles";

// Vercel refuses a function response over about 4.5MB. Past this the download
// would fail with no explanation, so say so instead.
const MAX_ZIP_BYTES = 4_300_000;

// Tenant-scoped exactly as lib/controlData.ts is. This route is the ONLY other
// place that talks to @vercel/blob directly, which is how it was missed: a
// literal "hvps/" here listed nothing at all on Jeppe, so Backup answered
// "No data found to backup" on every school except HVPS.
//
// It must also carry the TOKEN, not just the prefix — on a multi-tenant
// deployment the prefix alone would point at the right path in the wrong
// store, and hand one school a zip of somebody else's records.


export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, BACKUP_PERMISSION);
  if (auth instanceof NextResponse) return auth;

  try {
    const { prefix: PREFIX, token } = await tenantScope();

    // Enumerate all blobs with pagination
    const allBlobs: { pathname: string; url: string; size: number }[] = [];
    let cursor: string | undefined;

    do {
      const result = await list({
        prefix: PREFIX,
        limit: 1000,
        cursor,
        token,
      });
      for (const blob of result.blobs) {
        allBlobs.push({ pathname: blob.pathname, url: blob.url, size: blob.size });
      }
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);

    if (allBlobs.length === 0) {
      return NextResponse.json({ error: "No data found to backup" }, { status: 404 });
    }

    // Refuse early when it cannot possibly fit: PDFs and images barely
    // compress, so three times the limit in raw files will not zip under it.
    // Saves fetching every file one by one only to say no at the end.
    const rawBytes = allBlobs.reduce((n, b) => n + (b.size || 0), 0);
    if (rawBytes > MAX_ZIP_BYTES * 3) {
      return NextResponse.json(
        {
          error: `This school holds ${(rawBytes / 1_000_000).toFixed(1)}MB of files, which is too large to download from here (the limit is about 4.3MB). Ask Outerjoin for a full export.`,
        },
        { status: 413 }
      );
    }

    // Build ZIP
    const zip = new JSZip();
    const skipped: string[] = [];

    for (const blob of allBlobs) {
      try {
        const res = await fetch(blob.url, {
          headers: {
            Authorization: `Bearer ${token || process.env.BLOB_READ_WRITE_TOKEN}`,
          },
          cache: "no-store",
        });

        if (!res.ok) {
          console.warn(`Skipping blob ${blob.pathname}: fetch returned ${res.status}`);
          skipped.push(`${blob.pathname} (HTTP ${res.status})`);
          continue;
        }

        // Strip the prefix so ZIP paths are clean (e.g. "roles.json" not "hvps/roles.json")
        const zipPath = blob.pathname.startsWith(PREFIX)
          ? blob.pathname.slice(PREFIX.length)
          : blob.pathname;

        // Bytes for everything. Reading a PDF, Word file or spreadsheet as
        // text corrupted it, so every document in a backup was unreadable.
        zip.file(zipPath, await res.arrayBuffer());
      } catch (err) {
        console.warn(`Skipping blob ${blob.pathname}: ${err}`);
        skipped.push(`${blob.pathname} (${err instanceof Error ? err.message : "failed"})`);
        continue;
      }
    }

    // A backup that quietly leaves files out is worse than none: list them.
    if (skipped.length) {
      zip.file(
        "SKIPPED-FILES.txt",
        `These ${skipped.length} file(s) could not be read and are NOT in this backup:\n\n${skipped.join("\n")}\n`
      );
    }

    const zipBuffer = Buffer.from(
      await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })
    );

    if (zipBuffer.length > MAX_ZIP_BYTES) {
      return NextResponse.json(
        {
          error: `The backup is ${(zipBuffer.length / 1_000_000).toFixed(1)}MB, which is too large to download from here (the limit is about 4.3MB). Ask Outerjoin for a full export.`,
        },
        { status: 413 }
      );
    }

    await recordActivity({
      ...actorFrom(req, auth),
      action: "backup.downloaded",
      entity: "system",
      summary: `Downloaded a full backup (${allBlobs.length - skipped.length} files${skipped.length ? `, ${skipped.length} could not be read` : ""})`,
    });

    const today = new Date().toISOString().slice(0, 10);
    const filename = `${PREFIX.replace(/\/$/, "")}-backup-${today}.zip`;

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition(filename),
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
