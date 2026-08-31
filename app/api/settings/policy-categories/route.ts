import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import {
  getPolicyCategories,
  savePolicyCategories,
} from "@/lib/policyCategoryData";

// Readable by any signed-in user: the upload form and the repository grid both
// need the list to offer it.
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  return NextResponse.json(await getPolicyCategories());
}

export async function PUT(req: NextRequest) {
  const session = await requirePermission(req, "manage_policies");
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const input = Array.isArray(body?.categories) ? body.categories : null;
    if (!input) {
      return NextResponse.json(
        { error: "A list of categories is required" },
        { status: 400 }
      );
    }

    // Returned from what was written rather than read back: a blob overwrite
    // takes a moment to propagate, and re-reading here would hand the page the
    // pre-save list.
    const saved = await savePolicyCategories(input);
    return NextResponse.json(saved);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
