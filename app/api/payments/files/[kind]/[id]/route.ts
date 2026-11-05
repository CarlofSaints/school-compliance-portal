import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireAnyPermission } from "@/lib/rolesData";
import { readFile } from "@/lib/controlData";
import { contentDisposition } from "@/lib/contentDisposition";
import { FILE_PATHS, getContacts, getInvoices, getScreens } from "@/lib/paymentData";
import type { StoredFile } from "@/lib/payments";

const TYPES: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

async function stored(kind: string, id: string): Promise<StoredFile | null | undefined> {
  if (kind === "invoice") return (await getInvoices()).find((x) => x.id === id);
  if (kind === "screen") return (await getScreens()).find((x) => x.id === id);
  return (await getContacts()).find((x) => x.id === id)?.proof;
}

// Opens in the browser; ?download=1 saves it. Only PDF and image bytes ever get
// stored (lib/payments.ts fileKind), so nothing here can run as a page on our origin.
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!(kind in FILE_PATHS)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const session =
    kind === "proof" ? await requirePermission(req, "manage_payments") : await requireAnyPermission(req, ["view_payments", "manage_payments"]);
  if (session instanceof NextResponse) return session;

  const file = await stored(kind, id);
  // A statement shows everything the school paid, salaries included: not for everyone who sees the inbox.
  if (file && "kind" in file && file.kind === "statement" && !session.permissions.includes("manage_payments")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const bytes = file ? await readFile(FILE_PATHS[kind as keyof typeof FILE_PATHS](id, file)) : null;
  if (!file || !bytes) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const disposition = contentDisposition(file.filename);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": TYPES[file.ext],
      "Content-Disposition": req.nextUrl.searchParams.get("download") ? disposition : disposition.replace(/^attachment/, "inline"),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
