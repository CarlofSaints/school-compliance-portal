import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { writeFile } from "@/lib/controlData";
import { FILE_PATHS, addContact, getContacts, uploadedFile } from "@/lib/paymentData";
import { cleanFilename, contactFromForm, parseContactInput, type Contact } from "@/lib/payments";

// Whole bank details: only for the people who keep this list. Signers see last digits in the inbox.
export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_payments");
  if (session instanceof NextResponse) return session;
  return NextResponse.json(await getContacts(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_payments");
  if (session instanceof NextResponse) return session;

  const form = await req.clone().formData().catch(() => null);
  const parsed = parseContactInput(contactFromForm(form?.get("contact")));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const hasFile = form?.get("file") instanceof File;
  if (parsed.value.type === "creditor" && !hasFile) return NextResponse.json({ error: "Upload proof of bank details." }, { status: 400 });
  const upload = hasFile ? await uploadedFile(req, ["pdf", "png", "jpg", "webp"]) : null;
  if (upload instanceof NextResponse) return upload;

  const now = new Date().toISOString();
  const id = randomUUID();
  const proof = upload ? { filename: cleanFilename(upload.name), ext: upload.ext } : null;
  if (upload && proof) await writeFile(FILE_PATHS.proof(id, proof), upload.bytes);
  const contact: Contact = { ...parsed.value, id, proof, createdBy: session.id, createdAt: now, updatedAt: now };
  await addContact(contact);
  await recordActivity({
    ...actorFrom(req, session),
    action: "payment.contact_created",
    entity: "payment",
    entityId: id,
    summary: `Added ${contact.type} contact "${contact.name}"`,
  });
  return NextResponse.json(contact, { status: 201 });
}
