import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { canManageTraining } from "@/lib/trainingAccess";
import { materialFile } from "@/lib/trainingLearner";
import { fileResponse } from "@/lib/trainingFile";

// The uploaded document behind a piece of material, behind the same gate as the material itself.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const out = await materialFile({ progressId: session.id, manager: canManageTraining(session) }, (await params).id);
  return out.ok ? fileResponse(out.body) : NextResponse.json({ error: out.error }, { status: out.status });
}
