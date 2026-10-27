import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { requirePermission } from "@/lib/rolesData";
import { tenantScope } from "@/lib/tenantContext";
import { BACKUP_CHUNK_BYTES, BACKUP_PERMISSION, isBackupPathInScope } from "@/lib/blobPath";

// One file of the backup, or one BACKUP_CHUNK_BYTES slice of it (?part=n) when
// it is bigger than a function response may be. The browser asks for each
// file the manifest (../route.ts) listed and zips them itself.
//
// 🔴 The path comes from the browser. It must be a full pathname inside THIS
// school's prefix, and the read uses THIS school's token, so it can only ever
// reach the school's own store.
export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, BACKUP_PERMISSION);
  if (auth instanceof NextResponse) return auth;

  const params = req.nextUrl.searchParams;
  const pathname = params.get("path");
  const partRaw = params.get("part");
  const part = partRaw === null ? null : Number(partRaw);
  if (part !== null && !(Number.isSafeInteger(part) && part >= 0)) {
    return NextResponse.json({ error: "Bad part number" }, { status: 400 });
  }

  try {
    const { prefix, token } = await tenantScope();
    if (!isBackupPathInScope(prefix, pathname)) {
      return NextResponse.json({ error: "Not a file in this school's storage" }, { status: 400 });
    }

    const start = (part ?? 0) * BACKUP_CHUNK_BYTES;
    const end = start + BACKUP_CHUNK_BYTES - 1;
    // Segments encoded so a "#" or "?" in a file name stays part of the name:
    // the SDK pastes a pathname into the URL as it is.
    const result = await get(pathname.split("/").map(encodeURIComponent).join("/"), {
      access: "private",
      useCache: false,
      token,
      headers: part === null ? undefined : { range: `bytes=${start}-${end}` },
    });
    if (!result || !result.stream) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    let body: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer> = result.stream;
    if (part === null) {
      if (result.blob.size > BACKUP_CHUNK_BYTES) {
        await result.stream.cancel();
        return NextResponse.json(
          { error: "File too large for one response, ask for it in parts" },
          { status: 413 }
        );
      }
    } else if (!result.headers.get("content-range")) {
      // shortcut: the store ignored Range, so the whole file is read and sliced
      // here, once per part. Correct but slow for a very large file; drop this
      // branch once Range is proven on the live store.
      const all = new Uint8Array(await new Response(result.stream).arrayBuffer());
      body = all.slice(start, end + 1);
    }

    return new Response(body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Backup file read failed:", err);
    return NextResponse.json({ error: "Could not read that file" }, { status: 500 });
  }
}

export const maxDuration = 60;
