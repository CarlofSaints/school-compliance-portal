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
  let bytes = await section38aPack(y, fullName, policy);
  // A route answer is capped near 4.5 MB. Without the policy, the checklist says to attach it by hand.
  if (bytes.length > 4_200_000 && policy.bytes) bytes = await section38aPack(y, fullName, { name: policy.name, bytes: null });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": contentDisposition(`Section 38A application ${y.year}.pdf`), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
  });
}
