import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getSpendById } from "@/lib/spendData";
import {
  getReminders,
  createReminder,
  todayIso,
} from "@/lib/reminderData";
import type {
  ReminderRecipient,
  ReminderFrequency,
  SpendReminder,
} from "@/lib/reminderData";
import { v4 as uuidv4 } from "uuid";

const VALID_RECIPIENTS: ReminderRecipient[] = [
  "admin",
  "applicant",
  "submitter",
  "custodian",
];
const VALID_FREQUENCIES: ReminderFrequency[] = [
  "once",
  "daily",
  "weekly",
  "monthly",
];

export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const reminders = await getReminders();
  const spendId = req.nextUrl.searchParams.get("spendId");

  // Everyone sees reminders on their own requests; view_all_spend sees the lot.
  const canSeeAll = session.permissions.includes("view_all_spend");
  const visible = canSeeAll
    ? reminders
    : reminders.filter((r) => r.createdBy === session.id);

  return NextResponse.json(
    spendId ? visible.filter((r) => r.spendId === spendId) : visible
  );
}

export async function POST(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const canManage =
    session.permissions.includes("approve_spend") ||
    session.permissions.includes("manage_spend_settings");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const spendId = String(body?.spendId ?? "");
    const app = await getSpendById(spendId);
    if (!app) {
      return NextResponse.json(
        { error: "Spend application not found" },
        { status: 404 }
      );
    }

    const recipients: ReminderRecipient[] = Array.isArray(body?.recipients)
      ? body.recipients.filter((r: string) =>
          VALID_RECIPIENTS.includes(r as ReminderRecipient)
        )
      : [];
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "Choose at least one person to remind" },
        { status: 400 }
      );
    }

    const nextRunAt = String(body?.nextRunAt ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextRunAt)) {
      return NextResponse.json(
        { error: "A reminder date is required" },
        { status: 400 }
      );
    }
    if (nextRunAt < todayIso()) {
      return NextResponse.json(
        { error: "The reminder date cannot be in the past" },
        { status: 400 }
      );
    }

    const frequency: ReminderFrequency = VALID_FREQUENCIES.includes(
      body?.frequency
    )
      ? body.frequency
      : "once";

    const reminder: SpendReminder = {
      id: uuidv4(),
      spendId,
      projectName: app.projectName,
      recipients,
      nextRunAt,
      frequency,
      anchorDay: Number(nextRunAt.slice(8, 10)),
      note: String(body?.note ?? "").trim().slice(0, 500),
      active: true,
      createdBy: session.id,
      createdByName: `${session.name} ${session.surname}`,
      createdAt: new Date().toISOString(),
    };

    await createReminder(reminder);
    return NextResponse.json(reminder, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
