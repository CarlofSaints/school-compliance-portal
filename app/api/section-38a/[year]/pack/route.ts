import { NextRequest, NextResponse } from "next/server";
import { resolveBranding } from "@/lib/brandingData";
import { contentDisposition } from "@/lib/contentDisposition";
import { getYear, guard, policyForPack } from "@/lib/section38aData";
import { section38aPack } from "@/lib/section38aPdf";

export async function GET(req: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  const auth = await guard(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  const y = await getYear(auth.year);
  if (!y.people.length) return NextResponse.json({ error: "Add a person first." }, { status: 409 });
  const [{ fullName }, policy] = await Promise.all([resolveBranding(), policyForPack(y.policyId)]);
  const bytes = await section38aPack(y, fullName, policy);
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": contentDisposition(`Section 38A application ${y.year}.pdf`), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
  });
}
