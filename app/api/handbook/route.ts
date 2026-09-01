import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import {
  getHandbookHtml,
  getHandbookMeta,
  saveHandbook,
} from "@/lib/handbookData";

export const dynamic = "force-dynamic";

// The guide is around 2MB because every screenshot is embedded in it.
export const maxDuration = 60;

// Readable by anyone signed in. The guide explains the portal to the people
// using it, so gating it any harder than the portal itself would be perverse.
//
// Note this returns the document in the response body rather than serving it at
// a URL a browser can navigate to. Sessions here travel in an x-user-id header,
// which a navigation or an iframe src cannot send, so a navigable route would
// have to be public, and the guide carries real names and the school's CAPEX
// figures. The page fetches this and renders it in a sandboxed iframe instead.
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const meta = await getHandbookMeta();

  // The page asks for the meta on its own first, so it can say whether a guide
  // exists without pulling 2MB down to find out.
  if (req.nextUrl.searchParams.get("meta") === "1") {
    return NextResponse.json(
      { meta },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const html = await getHandbookHtml();
  if (!html) {
    return NextResponse.json(
      { error: "No guide has been published yet." },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { html, meta },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Publishing a new edition of the guide.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_policies");
  if (session instanceof NextResponse) return session;

  try {
    const form = await req.formData();
    const file = form.get("guide") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (!/\.html?$/i.test(file.name)) {
      return NextResponse.json(
        { error: "The guide must be an HTML file." },
        { status: 400 }
      );
    }

    const html = await file.text();
    if (!html.trim()) {
      return NextResponse.json({ error: "That file is empty." }, { status: 400 });
    }

    // Whatever the <title> says, falling back to the file name, so the page can
    // name the document without the uploader having to type it.
    const title =
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      file.name.replace(/\.html?$/i, "");

    const meta = await saveHandbook(html, {
      uploadedAt: new Date().toISOString(),
      uploadedBy: session.id,
      uploadedByName:
        `${session.name || ""} ${session.surname || ""}`.trim() ||
        session.name ||
        session.email,
      title,
    });

    return NextResponse.json(
      { meta },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("Guide upload failed:", err);
    return NextResponse.json(
      { error: "That guide could not be saved." },
      { status: 500 }
    );
  }
}
