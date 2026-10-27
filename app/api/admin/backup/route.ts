import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { requirePermission } from "@/lib/rolesData";
import { tenantScope } from "@/lib/tenantContext";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { BACKUP_CHUNK_BYTES, BACKUP_PERMISSION } from "@/lib/blobPath";

// This route only LISTS the school's files. The browser fetches each one from
// /api/admin/backup/file and builds the zip itself, because a Vercel function
// response is capped at about 4.5MB and a school with real policy PDFs is far
// past that. POPIA (s14/s23) and our Terms promise a full export at any size,
// which is also why the sent box is no longer left out.
//
// Tenant-scoped exactly as lib/controlData.ts is. This route and the file
// route are the only other places that talk to @vercel/blob directly: a
// literal "hvps/" here once listed nothing at all on Jeppe. It must carry the
// TOKEN, not just the prefix: on a multi-tenant deployment the prefix alone
// would point at the right path in the wrong store.
export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, BACKUP_PERMISSION);
  if (auth instanceof NextResponse) return auth;

  try {
    const { prefix, token } = await tenantScope();

    const files: { pathname: string; size: number }[] = [];
    let cursor: string | undefined;
    do {
      const result = await list({ prefix, limit: 1000, cursor, token });
      for (const blob of result.blobs) {
        files.push({ pathname: blob.pathname, size: blob.size });
      }
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);

    if (files.length === 0) {
      return NextResponse.json({ error: "No data found to backup" }, { status: 404 });
    }

    // Logged here: handing over the full file list is the start of the export,
    // and logging every per-file request would flood the log.
    const totalBytes = files.reduce((n, f) => n + (f.size || 0), 0);
    await recordActivity({
      ...actorFrom(req, auth),
      action: "backup.downloaded",
      entity: "system",
      summary: `Downloaded a full backup (${files.length} files, ${(totalBytes / 1_000_000).toFixed(1)}MB)`,
    });

    const today = new Date().toISOString().slice(0, 10);
    return NextResponse.json(
      {
        prefix,
        filename: `${prefix.replace(/\/$/, "")}-backup-${today}.zip`,
        chunkBytes: BACKUP_CHUNK_BYTES,
        files,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("Backup listing failed:", err);
    return NextResponse.json({ error: "Backup failed" }, { status: 500 });
  }
}

export const maxDuration = 60;
