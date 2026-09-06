import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requireAnyPermission } from "@/lib/rolesData";
import {
  getMinutes,
  updateMinutes,
  deleteMinutes,
  MinutesLockedError,
} from "@/lib/minutesData";
import { checkPeriod, isLocked } from "@/lib/minutes";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const CAN_MANAGE = ["manage_minutes", "manage_users"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const record = await getMinutes(id);
  if (!record) {
    return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  }
  return NextResponse.json(record);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await getMinutes(id);
  if (!existing) {
    return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  }

  // Checked here as well as inside updateMinutes. The store is the rule and
  // this is the courtesy: it lets the caller be told WHY in words, rather than
  // catching an exception and guessing.
  if (isLocked(existing.status)) {
    return NextResponse.json(
      {
        error:
          "These minutes have been signed. A signed record cannot be changed, so make a new set if something needs correcting.",
      },
      { status: 409 }
    );
  }

  try {
    const body = await req.json();
    const updates: Parameters<typeof updateMinutes>[1] = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) {
        return NextResponse.json({ error: "Give these minutes a name." }, { status: 400 });
      }
      updates.title = title;
    }
    if (body.body !== undefined) updates.body = body.body;
    if (body.period !== undefined) {
      const problem = checkPeriod(body.period);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      updates.period = body.period;
    }
    if (body.sections !== undefined) {
      if (!Array.isArray(body.sections)) {
        return NextResponse.json({ error: "Sections must be a list." }, { status: 400 });
      }
      // Renumbered from the order they arrive in, so the client never has to
      // keep the order field consistent while dragging things about. Order is
      // part of the signing hash, so it has to be unambiguous.
      updates.sections = body.sections.map(
        (
          s: {
            id?: string;
            title?: string;
            body?: string;
            numberingStartsHere?: boolean;
            personIds?: string[];
          },
          i: number
        ) => ({
          id: String(s.id || crypto.randomUUID()),
          title: String(s.title || "").trim(),
          body: String(s.body || ""),
          // Named explicitly: this rebuilds each section field by field, so a
          // property left out here is discarded on every save.
          numberingStartsHere: s.numberingStartsHere || undefined,
          personIds: s.personIds?.length ? s.personIds : undefined,
          order: i + 1,
        })
      );
    }

    const saved = await updateMinutes(id, updates);
    if (!saved) {
      return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
    }

    await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.updated",
      entity: "minutes",
      entityId: id,
      summary: `Edited minutes "${saved.title}"`,
      detail: { changed: Object.keys(updates) },
    });

    // What was SAVED, not a re-read. A read straight after a write can serve
    // the previous copy, which makes a correct save look like it failed.
    return NextResponse.json(saved);
  } catch (err) {
    if (err instanceof MinutesLockedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[minutes] Update failed:", err);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await getMinutes(id);
  if (!existing) {
    return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  }

  try {
    const ok = await deleteMinutes(id);
    if (!ok) {
      return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
    }
    await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.deleted",
      entity: "minutes",
      entityId: id,
      summary: `Deleted draft minutes "${existing.title}"`,
      detail: { status: existing.status, period: JSON.stringify(existing.period) },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof MinutesLockedError) {
      // Signed minutes are a record the school is legally required to keep.
      return NextResponse.json(
        {
          error:
            "Signed minutes cannot be deleted. They are part of the school's record.",
        },
        { status: 409 }
      );
    }
    console.error("[minutes] Delete failed:", err);
    return NextResponse.json({ error: "Could not delete." }, { status: 500 });
  }
}
