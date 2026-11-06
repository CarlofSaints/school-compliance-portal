import { createHash, randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { deleteFolder, writeFile } from "@/lib/controlData";
import { getCredits, maySpendCredits } from "@/lib/contentTranslation";
import { STATEMENT_HOLD, READ_HOLD, paidRead, readBankScreen, readBankStatement } from "@/lib/paymentAi";
import { FILE_PATHS, NO_CREDITS, addScreen, getScreens, readFailed, removeScreen, uploadedFile } from "@/lib/paymentData";
import { cleanBankLines, cleanFilename, type BankLine } from "@/lib/payments";

// A statement is many pages.
export const maxDuration = 300;

// A screenshot of the bank's authorisation screen, or with ?kind=statement a
// bank statement: read once, its payments kept beside the file. Pairing with
// invoices happens on every inbox read.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_payments");
  if (session instanceof NextResponse) return session;
  const statement = req.nextUrl.searchParams.get("kind") === "statement";
  // A notice gets our stamp, which cannot go on a WEBP or a locked PDF. Refused now, before the paid read.
  const file = await uploadedFile(req, statement ? ["png", "jpg", "webp", "pdf"] : ["png", "jpg", "pdf"]);
  if (file instanceof NextResponse) return file;
  if (!statement && file.ext === "pdf" && !(await PDFDocument.load(file.bytes).then((d) => d.getPageCount() > 0, () => false))) {
    return NextResponse.json({ error: "This PDF is locked or damaged, so our stamp cannot go on it. Load a screenshot of the notice instead." }, { status: 415 });
  }

  const hash = createHash("sha256").update(file.bytes).digest("hex");
  if ((await getScreens()).some((s) => s.hash === hash)) return NextResponse.json({ error: "This file has already been loaded." }, { status: 409 });
  if (!(await maySpendCredits(session.id))) {
    return NextResponse.json({ error: "You are not allowed to spend credits. Ask an administrator to tick \"Can spend translation credits\" for you on Admin > Users." }, { status: 403 });
  }
  const limited = await enforce([[LIMITS.paymentReadUser, session.id], [LIMITS.paymentReadSchool, "school"]]);
  if (limited) return limited;

  const id = randomUUID();
  const stored = { filename: cleanFilename(file.name), ext: file.ext };
  try {
    const paid = await paidRead<BankLine[]>(async () => {
      const { data, usage } = await (statement ? readBankStatement : readBankScreen)(file.bytes, file.ext, Date.now() + 280_000);
      const lines = cleanBankLines(data);
      if (lines.length) {
        await writeFile(FILE_PATHS.screen(id, stored), file.bytes);
        await addScreen({ ...stored, ...(statement ? { kind: "statement" as const } : {}), id, hash, loadedBy: session.id, loadedByName: `${session.name} ${session.surname}`.trim(), loadedAt: new Date().toISOString(), lines });
      }
      return { data: lines, usage };
    }, (lines) => lines.length > 0, statement ? STATEMENT_HOLD : READ_HOLD);
    if (!paid.ok) {
      return paid.reason === "no_credits"
        ? NextResponse.json({ error: NO_CREDITS }, { status: 402 })
        : NextResponse.json({ error: "No payments could be found in this file. Nothing was charged." }, { status: 422 });
    }
    await recordActivity({
      ...actorFrom(req, session),
      action: "payment.screen_loaded",
      entity: "payment",
      entityId: id,
      summary: `Loaded a bank ${statement ? "statement" : "screenshot"} with ${paid.data.length} payment(s)`,
    });
    return NextResponse.json({ id, payments: paid.data.length, charged: paid.charged, balance: await getCredits() }, { status: 201 });
  } catch (err) {
    return readFailed(err);
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requirePermission(req, "manage_payments");
  if (session instanceof NextResponse) return session;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const removed = await removeScreen(id);
  if (!removed) return NextResponse.json({ error: "Screenshot not found." }, { status: 404 });
  if (removed === "signed") return NextResponse.json({ error: "A signed payment notice cannot be removed." }, { status: 409 });
  await deleteFolder(`payments/screens/${id}`);
  await recordActivity({
    ...actorFrom(req, session),
    action: "payment.screen_deleted",
    entity: "payment",
    entityId: id,
    summary: `Removed a bank screenshot with ${removed.lines.length} payment(s)`,
  });
  return NextResponse.json({ success: true });
}
