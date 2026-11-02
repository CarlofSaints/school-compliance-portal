import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { createMovedSchool, copyBatch, compare, applyBuiltInBranding, setHostnames, MoveError } from "@/lib/tenantMove";
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
  const sourcePrefix = String(b.sourcePrefix ?? "").trim();
  if (!/^[a-z0-9-]{2,40}$/.test(key)) return NextResponse.json({ error: "Give the school's key, e.g. jeppe." }, { status: 400 });
  const needsSource = ["copy", "compare"].includes(b.action);
  if (needsSource && (!sourceToken.startsWith("vercel_blob_rw_") || !/^[a-z0-9-]+\/$/.test(sourcePrefix))) {
    return NextResponse.json({ error: "Paste the old app's Blob read-write token and its folder, e.g. jeppe/." }, { status: 400 });
  }
  try {
    switch (b.action) {
      case "status": {
        const t = await getTenantByKey(key);
        return NextResponse.json({ exists: !!t, hostnames: t?.hostnames ?? [], name: t?.name });
      }
      case "create":
        return NextResponse.json({ tenant: (({ blobTokenSealed: _s, ...t }) => t)(await createMovedSchool(key, String(b.name ?? "").trim(), String(b.testHostname ?? "").trim().toLowerCase())) });
      case "copy":
        return NextResponse.json(await copyBatch(sourceToken, sourcePrefix, key, typeof b.cursor === "string" ? b.cursor : undefined));
      case "compare":
        return NextResponse.json(await compare(sourceToken, sourcePrefix, key));
      case "brand":
        return NextResponse.json({ branding: await applyBuiltInBranding(key, b.look) });
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
