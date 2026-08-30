import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import { getTags, createTag, getTagCounts } from "@/lib/tagData";
import type { Tag } from "@/lib/tagData";
import { v4 as uuidv4 } from "uuid";

// Readable by any signed-in user: tags are shown as labels on people and users
// throughout the portal, and the approval settings page needs the list.
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const [tags, counts] = await Promise.all([getTags(), getTagCounts()]);
  return NextResponse.json(
    tags.map((t) => ({ ...t, memberCount: counts[t.id] || 0 }))
  );
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_tags");
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "A tag needs a name" }, { status: 400 });
    }

    const tags = await getTags();
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json(
        { error: "A tag with that name already exists" },
        { status: 409 }
      );
    }

    const tag: Tag = {
      id: uuidv4(),
      name,
      description: String(body?.description ?? "").trim().slice(0, 300),
      color: String(body?.color ?? "slate"),
      createdAt: new Date().toISOString(),
    };
    await createTag(tag);
    return NextResponse.json(tag, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
