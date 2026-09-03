import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getPeople } from "@/lib/peopleData";
import { getUsers } from "@/lib/userData";
import { getActionItems, updateActionItems } from "@/lib/actionItemData";
import type { ActionItem } from "@/lib/actionItemData";
import { ACTION_ADMIN_PERMISSIONS } from "@/lib/actionItemRecipients";
import { parseActionEdit } from "@/lib/actionItemFields";
import { notifyAssignees } from "@/lib/actionItemNotify";

export const maxDuration = 300;

const MAX_ROWS = 200;

// Editing several actions at once - reassigning a departing member's list,
// putting an ETA on a whole term's items, closing off a batch after a meeting.
//
// This exists because looping PATCH over several actions LOSES some of them.
// Each write is a read-modify-write of the whole store, so a later one built on
// a stale read erases an earlier one. Five assignments sent in a row, each
// answering 200, left two. Anything touching more than one action comes here.
export async function POST(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTION_ADMIN_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const rows: Record<string, unknown>[] = Array.isArray(body?.updates)
      ? body.updates
      : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `That is more than ${MAX_ROWS} actions in one go` },
        { status: 400 }
      );
    }

    const [items, people, users] = await Promise.all([
      getActionItems(),
      getPeople(),
      getUsers(),
    ]);
    const byId = new Map(items.map((i) => [i.id, i]));

    const edits: {
      id: string;
      updates: Partial<Omit<ActionItem, "id" | "ref">>;
    }[] = [];
    const newlyAssignedBy = new Map<string, string[]>();
    const problems: string[] = [];

    for (const row of rows) {
      const id = String(row?.id ?? "");
      const existing = byId.get(id);
      if (!existing) {
        problems.push(`${id || "(no id)"} is not an action on the register`);
        continue;
      }
      const parsed = parseActionEdit(row, existing, people, users);
      if (parsed.error) {
        problems.push(`${existing.ref}: ${parsed.error}`);
        continue;
      }
      edits.push({ id, updates: parsed.updates });
      if (parsed.newlyAssigned.length > 0) {
        newlyAssignedBy.set(id, parsed.newlyAssigned);
      }
    }

    // All or nothing. A half-applied bulk change is the worst outcome: the
    // caller cannot tell which half, and re-running it is not safe either.
    if (problems.length > 0) {
      return NextResponse.json(
        { error: "Nothing was changed", problems },
        { status: 400 }
      );
    }

    const { saved, missing } = await updateActionItems(edits);

    let notified = 0;
    if (body?.notify === true) {
      for (const item of saved) {
        const newly = newlyAssignedBy.get(item.id);
        if (newly?.length) notified += await notifyAssignees(item, newly);
      }
    }

    return NextResponse.json({
      changed: saved.length,
      refs: saved.map((s) => s.ref),
      notified,
      missing,
      items: saved,
    });
  } catch (err) {
    console.error("[action-items] bulk update failed:", err);
    return NextResponse.json(
      { error: "Could not apply those changes" },
      { status: 500 }
    );
  }
}
