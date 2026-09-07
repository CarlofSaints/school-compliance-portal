import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getActionItems } from "@/lib/actionItemData";

/**
 * The actions raised out of one set of minutes.
 *
 * Filtered here rather than in the browser: the register can run to hundreds
 * of rows and the minutes page needs three of them.
 *
 * Login-only, matching the register itself - who agreed to do what by when
 * belongs to everybody in the portal, and somebody who cannot see their own
 * action cannot act on it.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const items = await getActionItems();
  const raised = items
    .filter((i) => i.fromMinutes?.minutesId === id)
    .map((i) => ({
      id: i.id,
      ref: i.ref,
      title: i.title,
      status: i.status,
      dueDate: i.dueDate,
      progress: i.progress,
      assigneeNames: i.assigneeNames,
      sectionId: i.fromMinutes?.sectionId,
    }));

  return NextResponse.json(raised, {
    headers: { "Cache-Control": "no-store" },
  });
}
