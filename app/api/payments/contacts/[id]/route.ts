import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { deleteFile, writeFile } from "@/lib/controlData";
import { FILE_PATHS, getContacts, removeContact, saveContact, uploadedFile } from "@/lib/paymentData";
import { bankChanged, cleanFilename, contactFromForm, parseContactInput } from "@/lib/payments";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(req, "manage_payments");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const current = (await getContacts()).find((c) => c.id === id);
  if (!current) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  const form = await req.clone().formData().catch(() => null);
  const parsed = parseContactInput(contactFromForm(form?.get("contact")));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Changed bank details are how invoice fraud starts: a new account always needs new proof.
  const changed = bankChanged(current.bank, parsed.value.bank);
  const hasFile = form?.get("file") instanceof File;
  if (changed && parsed.value.bank && !hasFile) {
    return NextResponse.json({ error: "The bank account changed. Upload new proof of bank details." }, { status: 400 });
  }
  if (parsed.value.type === "creditor" && !hasFile && !current.proof) return NextResponse.json({ error: "Upload proof of bank details." }, { status: 400 });

  const upload = hasFile ? await uploadedFile(req, ["pdf", "png", "jpg", "webp"]) : null;
  if (upload instanceof NextResponse) return upload;
  const proof = upload ? { filename: cleanFilename(upload.name), ext: upload.ext } : null;
  if (upload && proof) await writeFile(FILE_PATHS.proof(id, proof), upload.bytes);

  const saved = await saveContact(id, parsed.value, proof);
  if (!saved) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  if (proof && current.proof && current.proof.ext !== proof.ext) await deleteFile(FILE_PATHS.proof(id, current.proof));
  await recordActivity({
    ...actorFrom(req, session),
    action: changed ? "payment.contact_bank_changed" : "payment.contact_updated",
    entity: "payment",
    entityId: id,
    // The account itself never goes in the log.
    summary: changed ? `Changed the bank details of contact "${saved.name}"` : `Updated contact "${saved.name}"`,
  });
  return NextResponse.json(saved);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(req, "manage_payments");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const removed = await removeContact(id);
  if (!removed) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  if (removed.proof) await deleteFile(FILE_PATHS.proof(id, removed.proof));
  await recordActivity({
    ...actorFrom(req, session),
    action: "payment.contact_deleted",
    entity: "payment",
    entityId: id,
    summary: `Deleted contact "${removed.name}"`,
  });
  return NextResponse.json({ success: true });
}
