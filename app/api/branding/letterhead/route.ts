import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import { patchDetector } from "docx";
import {
  getLetterhead,
  saveLetterhead,
  readLetterheadFile,
  removeLetterhead,
} from "@/lib/letterheadData";
import { REQUIRED_PLACEHOLDER } from "@/lib/letterhead";
import { contentDisposition } from "@/lib/contentDisposition";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// A letterhead with embedded fonts is easily a couple of MB. HVPS's own is 1.8.
const MAX_BYTES = 10 * 1024 * 1024;

/** Reading is only a login: every page in the portal shows the branding. */
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  // ?file=1 downloads the letterhead itself, so a school can get back the copy
  // it uploaded rather than hunting for the original on somebody's laptop.
  if (req.nextUrl.searchParams.get("file") === "1") {
    const meta = await getLetterhead();
    const bytes = meta ? await readLetterheadFile() : null;
    if (!meta || !bytes) {
      return NextResponse.json({ error: "No letterhead uploaded" }, { status: 404 });
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": DOCX,
        "Content-Disposition": contentDisposition(meta.filename),
        "Content-Length": String(bytes.length),
      },
    });
  }

  return NextResponse.json(await getLetterhead());
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a Word letterhead to upload." }, { status: 400 });
  }
  if (file.type !== DOCX) {
    return NextResponse.json(
      {
        error:
          "That has to be a Word .docx file. An older .doc will not work: save it as .docx from Word first.",
      },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is over 10MB." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // 🔴 Validated NOW, not at download time. A letterhead with no {{content}}
  // marker produces minutes with nothing in them, and the person who would
  // discover that is a secretary trying to send a document to the DoE. It is
  // the upload that must fail, while somebody is looking at it.
  let placeholders: string[];
  try {
    placeholders = [...(await patchDetector({ data: bytes }))];
  } catch {
    return NextResponse.json(
      {
        error:
          "That file could not be read as a Word document. If Word opens it, try File then Save As and choose Word Document (.docx).",
      },
      { status: 400 }
    );
  }

  if (!placeholders.includes(REQUIRED_PLACEHOLDER)) {
    return NextResponse.json(
      {
        error:
          "That letterhead has no {{content}} marker, so there is nowhere to put the minutes. Open it in Word, type {{content}} on its own line where the items should go, save, and upload it again.",
        placeholders,
      },
      { status: 400 }
    );
  }

  const meta = await saveLetterhead(bytes, file.name, session.email, placeholders);

  await recordActivity({
    ...actorFrom(req, session),
    action: "branding.letterhead.uploaded",
    entity: "branding",
    entityId: "letterhead",
    summary: `Uploaded the Word letterhead "${file.name}"`,
    detail: { size: bytes.length, placeholders: placeholders.join(", ") },
  });

  return NextResponse.json(meta);
}

export async function DELETE(req: NextRequest) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;

  await removeLetterhead();
  await recordActivity({
    ...actorFrom(req, session),
    action: "branding.letterhead.removed",
    entity: "branding",
    entityId: "letterhead",
    summary: "Removed the Word letterhead",
  });
  // Not an error state: documents go back to the generated layout, which is
  // what every school without a letterhead already gets.
  return NextResponse.json({ ok: true });
}
