import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import {
  getSpendById,
  updateSpendApplication,
  getCustodian,
} from "@/lib/spendData";
import type { SpendNote, SpendApplication } from "@/lib/spendData";
import { v4 as uuidv4 } from "uuid";

const MAX_LENGTH = 2000;

// Notes are the informal running commentary on a project, not an approval, so
// they are open to anyone connected to it: the usual viewers (submitter,
// view_all_spend, approve_spend) PLUS the applicant and the custodian, who are
// named on the project but would otherwise be shut out of it entirely.
function canSee(
  app: Pick<
    SpendApplication,
    | "submittedBy"
    | "applicantUserId"
    | "custodianUserId"
    | "custodianName"
    | "applicantName"
    | "applicantSurname"
  >,
  session: { id: string; permissions: string[] }
): boolean {
  return (
    app.submittedBy === session.id ||
    app.applicantUserId === session.id ||
    getCustodian(app).userId === session.id ||
    session.permissions.includes("view_all_spend") ||
    session.permissions.includes("approve_spend")
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const app = await getSpendById(id);
  if (!app) {
    return NextResponse.json(
      { error: "Spend application not found" },
      { status: 404 }
    );
  }
  if (!canSee(app, session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Newest first - the latest note is the one people are looking for.
  const notes = [...(app.notes || [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  return NextResponse.json(notes);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const app = await getSpendById(id);
  if (!app) {
    return NextResponse.json(
      { error: "Spend application not found" },
      { status: 404 }
    );
  }
  if (!canSee(app, session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: string;
  try {
    ({ body } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const text = String(body ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "The note is empty" }, { status: 400 });
  }
  if (text.length > MAX_LENGTH) {
    return NextResponse.json(
      { error: `A note can be at most ${MAX_LENGTH} characters` },
      { status: 400 }
    );
  }

  // Author and timestamp come from the session and the server clock, never
  // from the request - a note has to say who really wrote it and when.
  const note: SpendNote = {
    id: uuidv4(),
    body: text,
    authorId: session.id,
    authorName: `${session.name} ${session.surname}`.trim(),
    createdAt: new Date().toISOString(),
  };

  const updated = await updateSpendApplication(id, {
    notes: [...(app.notes || []), note],
  });

  return NextResponse.json(
    { note, count: updated?.notes?.length ?? 0 },
    { status: 201 }
  );
}
