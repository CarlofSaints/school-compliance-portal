import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requireAnyPermission } from "@/lib/rolesData";
import { getMinutes, saveSignedCopy, readSignedCopy } from "@/lib/minutesData";
import { isLocked, MINUTES_STATUS_LABELS } from "@/lib/minutes";
import { documentHash, shortHash } from "@/lib/minutesSigning";
import { contentDisposition } from "@/lib/contentDisposition";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const CAN_MANAGE = ["manage_minutes", "manage_users"];

// A scan or photograph of a signed page. Images as well as documents, because
// the realistic thing a school does is photograph the signed page on a phone.
const ACCEPTED: Record<string, true> = {
  "application/pdf": true,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
  "application/msword": true,
  "image/jpeg": true,
  "image/png": true,
  "image/heic": true,
  "image/webp": true,
};
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Uploads the wet ink copy, which closes the minutes.
 *
 * Carl: "those who prefer a wet ink signature can sign and then upload."
 *
 * 🔴 The hash of the minutes as they stand is recorded with the file, exactly
 * as it is for a code signature. A paper signature that was not bound to a
 * version would mean less than an electronic one, which would be an odd thing
 * for the more traditional route to be worth.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const record = await getMinutes(id);
  if (!record) {
    return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  }
  if (isLocked(record.status)) {
    return NextResponse.json(
      {
        error: `These minutes are ${MINUTES_STATUS_LABELS[record.status].toLowerCase()} and cannot be signed again.`,
      },
      { status: 409 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose the signed file to upload." }, { status: 400 });
  }
  if (!ACCEPTED[file.type]) {
    return NextResponse.json(
      { error: "Upload a PDF, a Word file, or a photograph of the signed page." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is over 15MB." }, { status: 400 });
  }

  const hash = documentHash(record);
  const bytes = Buffer.from(await file.arrayBuffer());
  const saved = await saveSignedCopy(id, bytes, file.name, file.type, session.email, hash);

  await recordActivity({
    ...actorFrom(req, session),
    action: "minutes.signed_on_paper",
    entity: "minutes",
    entityId: id,
    summary: `Uploaded a signed copy of "${record.title}", closing it`,
    detail: { filename: file.name, size: bytes.length, documentHash: hash },
  });

  return NextResponse.json({ record: saved, documentRef: shortHash(hash) });
}

/** The signed copy back. Only a login, like every other read in this module. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const record = await getMinutes(id);
  if (!record?.signedCopy) {
    return NextResponse.json({ error: "No signed copy for these minutes" }, { status: 404 });
  }

  const bytes = await readSignedCopy(id);
  if (!bytes) {
    // The record says there is a file and the bytes are gone. Said out loud,
    // rather than an empty download that reads as a corrupt file.
    return NextResponse.json({ error: "That file is unavailable" }, { status: 404 });
  }

  await recordActivity({
    ...actorFrom(req, session),
    action: "minutes.signed_copy.downloaded",
    entity: "minutes",
    entityId: id,
    summary: `Downloaded the signed copy of "${record.title}"`,
    detail: { filename: record.signedCopy.filename },
  });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": record.signedCopy.contentType || "application/octet-stream",
      // Through the helper: an HTTP header is Latin-1, so an accented school
      // name in the filename would otherwise throw.
      "Content-Disposition": contentDisposition(record.signedCopy.filename),
      "Content-Length": String(bytes.length),
    },
  });
}
