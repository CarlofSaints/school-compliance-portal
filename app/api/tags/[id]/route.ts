import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { requireLogin } from "@/lib/rolesData";
import { updateTag, deleteTag, getTagMembers } from "@/lib/tagData";
import { getApprovalSettings } from "@/lib/approvalSettings";

// Who currently carries this tag - used by the tags page and by the approval
// settings page to show what a requirement actually resolves to.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  return NextResponse.json(await getTagMembers(id));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_tags");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  try {
    const body = await req.json();
    const updated = await updateTag(id, {
      name: String(body?.name ?? "").trim() || undefined,
      description: String(body?.description ?? "").trim().slice(0, 300),
      color: String(body?.color ?? "slate"),
    });
    if (!updated) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_tags");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  // Refuse rather than quietly break an approval band that depends on it -
  // deleting the tag would leave that band with nobody able to approve.
  const settings = await getApprovalSettings();
  const usedBy = settings.tiers.filter((t) =>
    t.requirements.some((r) => r.tagId === id)
  );
  if (usedBy.length > 0) {
    return NextResponse.json(
      {
        error: `This tag is used by the approval band${usedBy.length > 1 ? "s" : ""} "${usedBy
          .map((t) => t.label)
          .join('", "')}". Remove it there first.`,
      },
      { status: 409 }
    );
  }

  const removed = await deleteTag(id);
  if (!removed) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
