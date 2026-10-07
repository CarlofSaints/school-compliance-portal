import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requireAnyPermission } from "@/lib/rolesData";
import {
  getActionCategories,
  saveActionCategories,
} from "@/lib/actionCategoryData";
import { getActionItems, updateActionItems } from "@/lib/actionItemData";
import { ACTION_ADMIN_PERMISSIONS } from "@/lib/actionItemRecipients";

// Readable by any signed-in user: the action form needs the list to offer it.
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  return NextResponse.json(await getActionCategories());
}

// Saves the list, and carries any renames onto the actions filed under the old
// name, so renaming "Sport" to "Extra Murals" moves the existing items with it
// instead of stranding them on a category that no longer exists.
//
// Body: { categories: string[], renames?: { from: string, to: string }[] }
export async function PUT(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTION_ADMIN_PERMISSIONS);
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

    const saved = await saveActionCategories(input);

    // Only a rename whose new name made it onto the saved list is applied, so
    // a rename that was then removed again cannot file items under nothing.
    const renames = new Map<string, string>();
    if (Array.isArray(body?.renames)) {
      for (const r of body.renames) {
        const from = String(r?.from ?? "").trim();
        const to = String(r?.to ?? "").trim();
        const target = saved.find((c) => c.toLowerCase() === to.toLowerCase());
        if (from && target && from !== target) renames.set(from, target);
      }
    }

    let moved = 0;
    if (renames.size > 0) {
      const items = await getActionItems();
      const edits = items
        .filter((i) => renames.has(i.category))
        .map((i) => ({
          id: i.id,
          updates: { category: renames.get(i.category)! },
        }));
      // One read and one write for all of them: looping single updates over
      // a blob loses all but the last.
      if (edits.length > 0) {
        const result = await updateActionItems(edits);
        moved = result.saved.length;
      }
    }

    // Returned from what was written rather than read back: a blob overwrite
    // takes a moment to propagate, and re-reading here would hand the page the
    // pre-save list.
    return NextResponse.json({ categories: saved, moved });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
