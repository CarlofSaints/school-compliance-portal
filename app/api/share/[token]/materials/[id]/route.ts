import { NextRequest, NextResponse } from "next/server";
import { guestContext } from "@/lib/campusGuestRoute";
import { openMaterial } from "@/lib/trainingLearner";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const ctx = await guestContext(req, token);
  if (ctx instanceof NextResponse) return ctx;
  const out = await openMaterial(ctx.learner, id);
  return out.ok ? NextResponse.json(out.body, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: out.error }, { status: out.status });
}
