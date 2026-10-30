import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getUsers } from "@/lib/userData";
import { createSend, getSends, sendNow, todaySast } from "@/lib/campusSends";
import { getMaterials, getModules, getTests } from "@/lib/trainingData";
import type { ShareKind } from "@/lib/campusShare";

export const dynamic = "force-dynamic";
// "Send now" emails everybody in the request, paced at about two a second.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const [sends, users] = await Promise.all([getSends(), getUsers()]);
  return NextResponse.json(
    {
      sends: [...sends].reverse().map(({ recipients, ...s }) => ({ ...s, recipientCount: recipients?.length ?? null })),
      people: users
        .filter((u) => !u.retiredAt && !u.termLocked && u.email)
        .map((u) => ({ id: u.id, name: `${u.name} ${u.surname}`.trim() }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      today: todaySast(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v)) || 0));

// Creates a send; one dated today or earlier goes out straight away.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  const kind = (["module", "material", "test"] as ShareKind[]).includes(body.kind) ? (body.kind as ShareKind) : null;
  const [modules, materials, tests] = await Promise.all([getModules(), getMaterials(), getTests()]);
  const target = kind === "module" ? modules : kind === "material" ? materials : kind === "test" ? tests : [];
  const item = target.find((x) => x.id === body.targetId);
  if (!kind || !item) return NextResponse.json({ error: "Choose what to send." }, { status: 400 });
  if (item.status !== "published") return NextResponse.json({ error: "Publish it first: people can only open published training." }, { status: 400 });

  const externalEmails = [...new Set((Array.isArray(body.externalEmails) ? body.externalEmails : []).map((e: unknown) => str(e, 200).toLowerCase()).filter((e: string) => EMAIL.test(e)))].slice(0, 200) as string[];
  const userIds = (Array.isArray(body.userIds) ? body.userIds : []).filter((x: unknown) => typeof x === "string").slice(0, 500) as string[];
  const everyone = body.everyone === true;
  if (!everyone && userIds.length === 0 && externalEmails.length === 0) {
    return NextResponse.json({ error: "Choose who to send it to." }, { status: 400 });
  }
  const sendOn = typeof body.sendOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.sendOn) ? body.sendOn : todaySast();
  const send = await createSend({
    kind,
    targetId: item.id,
    title: item.title,
    subject: str(body.subject, 200) || `Campus: ${item.title}`,
    message: str(body.message, 3000),
    everyone,
    userIds,
    externalEmails,
    sendOn,
    remindEveryDays: num(body.remindEveryDays, 0, 60),
    remindMax: num(body.remindMax, 0, 10),
    createdBy: session.id,
    createdByName: `${session.name} ${session.surname}`.trim(),
  });
  if (sendOn <= todaySast()) {
    const done = await sendNow(send.id);
    return NextResponse.json({ ...done, recipients: undefined }, { status: 201 });
  }
  return NextResponse.json(send, { status: 201 });
}
