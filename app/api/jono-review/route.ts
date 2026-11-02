import { NextRequest, NextResponse } from "next/server";
import { cleanQuestion, secretMatches, storeOnPlatform } from "@/lib/jonoQuestions";
import { isMultiTenant } from "@/lib/tenantRegistry";

// Where HVPS and Jeppe (their own deployments) send the "how do I..." questions
// Jono could not answer from the guide, so Carl reviews every school in one
// place (lib/jonoQuestions.ts). Only on the platform, and only with the shared
// secret: anything else is a 404, so the route does not advertise itself.
export async function POST(req: NextRequest) {
  if (!isMultiTenant() || !secretMatches(req.headers.get("x-jono-review-secret"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const item = cleanQuestion(await req.json().catch(() => null));
  if (!item) return NextResponse.json({ error: "Nothing to keep." }, { status: 400 });
  await storeOnPlatform(item);
  return NextResponse.json({ ok: true });
}
