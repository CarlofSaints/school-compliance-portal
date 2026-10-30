import { NextRequest, NextResponse } from "next/server";
import { guestContext } from "@/lib/campusGuestRoute";
import { materialFile } from "@/lib/trainingLearner";
import { fileResponse } from "@/lib/trainingFile";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const ctx = await guestContext(req, token);
  if (ctx instanceof NextResponse) return ctx;
  const out = await materialFile(ctx.learner, id);
  return out.ok ? fileResponse(out.body) : NextResponse.json({ error: out.error }, { status: out.status });
}
