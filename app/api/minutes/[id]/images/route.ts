import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getMinutes } from "@/lib/minutesData";
import { isTextEditable } from "@/lib/minutesAutosave";
import { imageKind, saveMinutesImage, MAX_IMAGE_BYTES } from "@/lib/minutesImages";

const CAN_MANAGE = ["manage_minutes", "manage_users"];

/**
 * A screenshot or photo for a minutes section. Returns its id; the editor puts
 * the "[image:...]" line into the section, and saving the text is what makes
 * it part of the minutes. Same people and same moments as editing the text.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const record = await getMinutes(id);
  if (!record) return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  if (!isTextEditable(record.status)) {
    return NextResponse.json({ error: "These minutes can no longer be changed, so a picture cannot be added." }, { status: 409 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a picture to add." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "That picture is over 4 MB. Take a smaller screenshot, or save it as a JPEG." }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!imageKind(bytes)) {
    return NextResponse.json({ error: "Add a PNG or JPEG picture (a screenshot is usually PNG)." }, { status: 400 });
  }
  return NextResponse.json({ id: await saveMinutesImage(id, bytes) });
}
