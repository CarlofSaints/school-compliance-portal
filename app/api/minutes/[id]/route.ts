import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requireAnyPermission } from "@/lib/rolesData";
import { sessionMayReadMinutes } from "@/lib/minutesAccess";
import {
  getMinutes,
  updateMinutes,
  deleteMinutes,
  MinutesLockedError,
  MinutesConflictError,
  type TextSaveInfo,
} from "@/lib/minutesData";
import {
  checkPeriod,
  checkMeetingDate,
  isLocked,
  cleanAttendees,
  isAttendance,
  withApologiesSection,
} from "@/lib/minutes";
import { documentHash, shortHash, minutesForClient } from "@/lib/minutesSigning";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const CAN_MANAGE = ["manage_minutes", "manage_users"];

// One "Edited minutes" log line per person per set of minutes per 5 minutes.
const EDIT_LOG_WINDOW_MS = 5 * 60_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const record = await getMinutes(id);
  // Not allowed reads exactly like not there: a FINCOM-only set is not even
  // confirmed to exist to someone outside FINCOM.
  if (!record || !(await sessionMayReadMinutes(session, record))) {
    return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  }
  // The hash of the document AS IT STANDS NOW, so the page can tell a
  // signature that still covers what is on screen from one that was applied
  // to a version since edited. Computed here rather than in the browser:
  // the two must agree, and one implementation cannot disagree with itself.
  const hash = documentHash(record);
  return NextResponse.json({
    ...minutesForClient(record),
    documentHash: hash,
    documentRef: shortHash(hash),
  });
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
  // 🔴 Out for signing, the words are frozen. Editing here used to be allowed,
  // so the Chair could sign version 1, the text change, the Principal sign
  // version 2, and the minutes close as "signed by both" on words the Chair
  // never saw. Delete (below) stays open as the way out.
  if (existing.status === "awaiting_signatures") {
    return NextResponse.json(
      {
        error:
          "These minutes are out for signing, so the text cannot change. Delete them and start again, or record the correction in the next set of minutes.",
      },
      { status: 409 }
    );
  }

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
    // Optional here: minutes added before the date existed may have none, and
    // "" (or null) clears one. 🔴 A date that disagrees with the period is NOT
    // refused here: autosave sends every field together, so refusing would
    // stop the typed words saving too. Agreement is required when the minutes
    // go out for signing (openSigning), where both become fixed.
    if (body.meetingDate === "" || body.meetingDate === null) {
      if (existing.meetingDate) updates.meetingDate = "";
    } else if (body.meetingDate !== undefined) {
      const problem = checkMeetingDate(body.meetingDate);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      updates.meetingDate = body.meetingDate;
    }
    if (body.sections !== undefined) {
      if (!Array.isArray(body.sections)) {
        return NextResponse.json({ error: "Sections must be a list." }, { status: 400 });
      }
      // Renumbered from the order they arrive in, so the client never has to
      // keep the order field consistent while dragging things about. Order is
      // part of the signing hash, so it has to be unambiguous.
      const rebuilt = body.sections.map(
        (
          s: {
            id?: string;
            title?: string;
            body?: string;
            numberingStartsHere?: boolean;
            personIds?: string[];
            responsible?: string;
            kind?: string;
            attendees?: unknown;
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
          responsible: s.responsible?.trim() || undefined,
          kind:
            s.kind === "attendance" || s.kind === "apologies"
              ? (s.kind as "attendance" | "apologies")
              : undefined,
          attendees: s.kind === "attendance" ? cleanAttendees(s.attendees) : undefined,
          order: i + 1,
        })
      );
      // 🔴 Minutes with an attendance list always keep an Apologies section.
      // Somebody ticked Apology or Not Present leaves the attendance list for
      // it, so without one a save could put a name nowhere at all.
      updates.sections = rebuilt.some(isAttendance)
        ? withApologiesSection(rebuilt)
        : rebuilt;
    }

    // 🔴 The words the editor started from. Checked INSIDE the atomic update,
    // against the copy being written over, so two people editing at once
    // cannot both "win": the second is told and shown the first one's text.
    // Reviews and signatures do not move textUpdatedAt, so they never count.
    // Older records have none yet: textBase falls back to updatedAt, as the
    // page does. A save with no base at all (a page still running older code)
    // is taken as before.
    // The check, the "last edited by" stamp and the log marker all happen in
    // updateMinutes, on the copy being written.
    const info: TextSaveInfo = {
      baseTextUpdatedAt: typeof body.baseTextUpdatedAt === "string" ? body.baseTextUpdatedAt : undefined,
      editedBy: { id: session.id, name: `${session.name} ${session.surname}`.trim() },
      logWindowMs: EDIT_LOG_WINDOW_MS,
    };
    const saved = await updateMinutes(id, updates, info);
    if (!saved) {
      return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
    }

    if (info.logIt) await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.updated",
      entity: "minutes",
      entityId: id,
      summary: `Edited minutes "${saved.title}"`,
      detail: { changed: Object.keys(updates) },
    });

    // What was SAVED, not a re-read. A read straight after a write can serve
    // the previous copy, which makes a correct save look like it failed.
    // Shaped like GET, so the page's "what is signed" reference stays.
    const hash = documentHash(saved);
    return NextResponse.json({ ...minutesForClient(saved), documentHash: hash, documentRef: shortHash(hash) });
  } catch (err) {
    if (err instanceof MinutesLockedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof MinutesConflictError) {
      const hash = documentHash(err.current);
      return NextResponse.json(
        {
          error: err.message,
          conflict: true,
          current: { ...minutesForClient(err.current), documentHash: hash, documentRef: shortHash(hash) },
        },
        { status: 409 }
      );
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

  // 🔴 The typed word is checked HERE as well as in the dialog. The dialog is
  // a courtesy; this route is callable by anything holding a session, and
  // "cannot be undone" has to be true of every caller, not just the button.
  const body = await req.json().catch(() => ({}));
  if (String(body?.confirm ?? "").trim() !== "DELETE") {
    return NextResponse.json(
      { error: 'Type the word DELETE to confirm.' },
      { status: 400 }
    );
  }

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
      summary: `Deleted minutes "${existing.title}"`,
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
