import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { createMovedSchool, copyBatch, pruneRemoved, compare, setHostnames, isMovableKey, MoveError } from "@/lib/tenantMove";
import { getTenantByKey } from "@/lib/tenantRegistry";

export const maxDuration = 120;

// Moving a school with its own deployment onto the shared app (lib/tenantMove.ts).
// 🔴 Platform admin only (fails closed, 404). The old store's token arrives in
// the body for each step and is used for that request only: never stored or logged.
export async function POST(req: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  const b = await req.json().catch(() => ({}));
  const key = String(b.key ?? "").trim().toLowerCase();
  const sourceToken = String(b.sourceToken ?? "").trim();
  // 🔴 Only HVPS and Jeppe (their own deployments), never a self-serve school.
  if (!/^[a-z0-9-]{2,40}$/.test(key) || !isMovableKey(key)) {
    return NextResponse.json({ error: "Only a school with its own deployment (jeppe, hvps) can be moved." }, { status: 400 });
  }
  if (["copy", "prune", "compare"].includes(b.action) && !sourceToken.startsWith("vercel_blob_rw_")) {
    return NextResponse.json({ error: "Paste the old app's Blob read-write token (vercel_blob_rw_...)." }, { status: 400 });
  }
  try {
    switch (b.action) {
      case "status": {
        const t = await getTenantByKey(key);
        return NextResponse.json({ exists: !!t, hostnames: t?.hostnames ?? [], name: t?.name });
      }
      case "create": {
        const { blobTokenSealed: _sealed, ...tenant } = await createMovedSchool(key, String(b.testHostname ?? "").trim().toLowerCase());
        return NextResponse.json({ tenant });
      }
      case "copy":
        return NextResponse.json(await copyBatch(sourceToken, key, typeof b.cursor === "string" ? b.cursor : undefined));
      case "prune":
        return NextResponse.json({ removed: await pruneRemoved(sourceToken, key) });
      case "compare":
        return NextResponse.json(await compare(sourceToken, key));
      case "hostnames":
        return NextResponse.json({ hostnames: await setHostnames(key, (Array.isArray(b.hostnames) ? b.hostnames : []).map(String)) });
      default:
        return NextResponse.json({ error: "Unknown step." }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof MoveError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[move-school]", b.action, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "That step failed." }, { status: 500 });
  }
}
