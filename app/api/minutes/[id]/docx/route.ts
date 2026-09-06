import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getMinutes } from "@/lib/minutesData";
import { buildMinutesDocx } from "@/lib/minutesDocx";
import { resolveBranding, readLogo } from "@/lib/brandingData";
import { contentDisposition } from "@/lib/contentDisposition";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { formatPeriod } from "@/lib/minutes";

// The wet-ink route.
//
// Carl: "add an option to download the final draft to MS Word so those who
// prefer a wet ink signature can sign and then upload". So this is a real
// document meant to be printed and signed, not a preview: the school's crest is
// embedded, its name is in the footer, and there are ruled signature lines.
//
// It exists for every set of minutes at every stage, not only finished ones. A
// secretary wants to read a draft on paper before sending it anywhere.
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

  try {
    const branding = await resolveBranding();
    // The school's uploaded crest if it has one; null is fine and the document
    // simply has no picture. A missing crest must not fail a download somebody
    // needs for a meeting tonight.
    const crest = await readLogo().catch(() => null);

    // No People lookup: the responsible name was frozen into each section
    // when the template was copied, so the document shows who was
    // responsible AT THAT MEETING rather than whoever holds the post today.
    const bytes = await buildMinutesDocx(record, branding, crest);

    await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.downloaded.docx",
      entity: "minutes",
      entityId: id,
      summary: `Downloaded "${record.title}" as Word`,
      detail: { status: record.status, draft: record.draftNumber },
    });

    const safePeriod = formatPeriod(record.period).replace(/[^A-Za-z0-9]+/g, "-");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": contentDisposition(
          `${record.title} ${safePeriod}.docx`.replace(/\s+/g, " ").trim()
        ),
        "Content-Length": String(bytes.length),
      },
    });
  } catch (err) {
    console.error("[minutes docx] Failed:", err);
    return NextResponse.json(
      { error: "Could not build the Word document." },
      { status: 500 }
    );
  }
}
