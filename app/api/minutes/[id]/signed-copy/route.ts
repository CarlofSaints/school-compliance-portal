import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { sessionMayReadMinutes } from "@/lib/minutesAccess";
import { getMinutes, saveSignedCopy, readSignedCopy } from "@/lib/minutesData";
import { MINUTES_STATUS_LABELS, mayUploadSignedCopy } from "@/lib/minutes";
import { documentHash, shortHash, minutesForClient } from "@/lib/minutesSigning";
import { contentDisposition } from "@/lib/contentDisposition";
import { tellAssigneesAtSigning } from "@/lib/minutesDistribution";
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
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const record = await getMinutes(id);
  if (!record || !(await sessionMayReadMinutes(session, record))) {
    return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  }
  // A minutes admin, or somebody on the signing list (the person who just
  // ticked who signed on paper is offered this upload straight after).
  const me = session.email.trim().toLowerCase();
  const onList = record.signatories.some((s) => s.email.trim().toLowerCase() === me);
  const manages = session.permissions.some((p) => CAN_MANAGE.includes(p));
  if (record.signedCopy && !manages) {
    return NextResponse.json({ error: "A signed copy is already kept. Only a minutes admin can replace it." }, { status: 403 });
  }
  if (!manages && !onList) {
    return NextResponse.json({ error: "Only a minutes admin or somebody on the signing list can upload the signed copy." }, { status: 403 });
  }
  if (!mayUploadSignedCopy(record)) {
    return NextResponse.json(
      {
        error: record.signedCopy
          ? "A signed copy is already kept with these minutes."
          : `These minutes are ${MINUTES_STATUS_LABELS[record.status].toLowerCase()} and cannot be signed again.`,
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
    summary: `Uploaded a signed copy of "${record.title}"${saved?.status === "signed" && record.status !== "signed" ? ", closing it" : ""}`,
    detail: { filename: file.name, size: bytes.length, documentHash: hash },
  });

  // The upload just closed the minutes: the people with actions from them are told now.
  if (saved?.status === "signed" && record.status !== "signed") {
    await tellAssigneesAtSigning(saved, new Set()).catch((err) => console.error("[minutes] could not tell assignees:", id, err));
  }
  return NextResponse.json({ record: minutesForClient(saved), documentRef: shortHash(hash) });
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
  if (!record?.signedCopy || !(await sessionMayReadMinutes(session, record))) {
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
