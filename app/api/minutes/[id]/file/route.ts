import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getMinutes, readOriginalFile } from "@/lib/minutesData";
import { contentDisposition } from "@/lib/contentDisposition";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

// The originally uploaded Word, Excel or PDF, straight back.
//
// Only a login is needed, matching the rest of the module: minutes are what the
// governing body agreed, and a member who cannot read them cannot do their job.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const record = await getMinutes(id);
  if (!record?.original) {
    return NextResponse.json({ error: "No file for these minutes" }, { status: 404 });
  }

  const bytes = await readOriginalFile(id);
  if (!bytes) {
    // The record says there is a file and the bytes are gone. Say so rather
    // than returning an empty download that looks like a corrupt file.
    return NextResponse.json({ error: "That file is unavailable" }, { status: 404 });
  }

  await recordActivity({
    ...actorFrom(req, session),
    action: "minutes.file.downloaded",
    entity: "minutes",
    entityId: id,
    summary: `Downloaded the file for "${record.title}"`,
    detail: { filename: record.original.filename },
  });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": record.original.contentType || "application/octet-stream",
      // Through the helper: a school name or a meeting title can carry an
      // accent, and an HTTP header is Latin-1, so a bare filename throws.
      "Content-Disposition": contentDisposition(record.original.filename),
      "Content-Length": String(bytes.length),
    },
  });
}
