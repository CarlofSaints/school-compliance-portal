import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requireAnyPermission } from "@/lib/rolesData";
import {
  listMinutes,
  createMinutes,
  saveOriginalFile,
  type MinutesRecord,
} from "@/lib/minutesData";
import { checkPeriod, type MeetingPeriod } from "@/lib/minutes";
import { getTemplate, sectionsFromTemplate } from "@/lib/minutesTemplates";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { v4 as uuidv4 } from "uuid";

// Managing minutes is ANY-of, so a permission key added later cannot lock out
// every existing admin: a stored role never gains a key it was not seeded with.
const CAN_MANAGE = ["manage_minutes", "manage_users"];

// Word and Excel, which is what Carl said schools have. The MIME types are the
// modern OOXML ones plus the legacy binary formats, because a school with a
// 2009 template really will upload a .doc.
const ACCEPTED: Record<string, true> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": true,
  "application/msword": true,
  "application/vnd.ms-excel": true,
  "application/pdf": true,
};
const MAX_BYTES = 15 * 1024 * 1024;

// READING needs only a login, not a permission. Minutes are what the governing
// body agreed; a member who cannot read them cannot do their job, and gating
// them would make the module useless to the people it is for.
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  return NextResponse.json(await listMinutes());
}

export async function POST(req: NextRequest) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  try {
    const form = await req.formData();
    const title = String(form.get("title") || "").trim();
    const body = String(form.get("body") || "sgb") as MinutesRecord["body"];

    let period: MeetingPeriod;
    try {
      period = JSON.parse(String(form.get("period") || ""));
    } catch {
      return NextResponse.json({ error: "Choose a period." }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json(
        { error: "Give these minutes a name." },
        { status: 400 }
      );
    }
    const periodProblem = checkPeriod(period);
    if (periodProblem) {
      return NextResponse.json({ error: periodProblem }, { status: 400 });
    }

    // Either a file is uploaded OR the minutes are typed in the app. Both are
    // valid on their own: Carl asked for storage of existing minutes as a use
    // in its own right, not only as a step towards signing.
    const file = form.get("file");
    const startBlank = String(form.get("startBlank") || "") === "1";
    const templateId = String(form.get("templateId") || "").trim();

    // 🔴 A template is COPIED, never referenced. If minutes rendered live from
    // a template, editing that template next year would silently rewrite what
    // a meeting in 2026 appears to have discussed, and a SIGNED record would
    // change under its own signatures.
    let sections: Awaited<ReturnType<typeof createMinutes>>["sections"] = [];
    if (templateId) {
      const template = await getTemplate(templateId);
      if (!template) {
        return NextResponse.json(
          { error: "That template no longer exists. Choose another." },
          { status: 400 }
        );
      }
      sections = sectionsFromTemplate(template);
    } else if (startBlank) {
      // No template chosen and nothing uploaded: one empty section, so the
      // secretary has somewhere to type rather than a page with no controls.
      sections = [{ id: uuidv4(), title: "Notes", body: "", order: 1 }];
    }

    const record = await createMinutes({
      id: uuidv4(),
      title,
      body,
      period,
      sections,
      createdBy: session.email,
    });

    let saved = record;
    if (file instanceof File && file.size > 0) {
      if (!ACCEPTED[file.type]) {
        return NextResponse.json(
          { error: "Upload a Word, Excel or PDF file." },
          { status: 400 }
        );
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: "That file is over 15MB." },
          { status: 400 }
        );
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      saved =
        (await saveOriginalFile(
          record.id,
          bytes,
          file.name,
          file.type,
          session.email
        )) ?? record;
    }

    await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.created",
      entity: "minutes",
      entityId: saved.id,
      summary: `Added minutes "${title}"`,
      detail: {
        body,
        period: JSON.stringify(period),
        uploaded: saved.original?.filename,
        fromTemplate: templateId || undefined,
        sections: saved.sections.length,
      },
    });

    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    console.error("[minutes] Create failed:", err);
    return NextResponse.json(
      { error: "Could not save those minutes." },
      { status: 500 }
    );
  }
}
