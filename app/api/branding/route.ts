import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import {
  getStoredBranding,
  saveStoredBranding,
  saveLogo,
  removeLogo,
} from "@/lib/brandingData";
import { checkColours, normaliseHex } from "@/lib/brandingColors";
import { isPlausibleEmail } from "@/lib/emailIdentity";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ACCEPTED: Record<string, true> = {
  "image/png": true,
  "image/jpeg": true,
  "image/webp": true,
  "image/svg+xml": true,
};

// Reading needs no permission: every signed-in page renders the crest and the
// colours, so gating it would just break the portal for everybody who is not an
// admin. Nothing here is a record.
export async function GET() {
  return NextResponse.json(await getStoredBranding());
}

export async function PUT(req: NextRequest) {
  // Changing how the whole school's portal looks, and what appears at the top
  // of its outgoing email, is an admin job.
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const {
      fullName,
      shortName,
      primary,
      accent,
      replyTo,
      logoDataUrl,
      removeExistingLogo,
    } = body ?? {};

    // Blank is fine and means "no Reply-To header". Anything non-blank has to
    // look like an address: a bad one can get the whole message rejected, and
    // the check also refuses the newlines that would let somebody inject a
    // header of their own.
    if (replyTo && !isPlausibleEmail(replyTo)) {
      return NextResponse.json(
        { error: "The reply-to address does not look like an email address." },
        { status: 400 }
      );
    }

    // Refuse a colour that is not a colour, rather than storing it and letting
    // the CSS variable silently break every page.
    for (const [label, value] of [
      ["Main colour", primary],
      ["Second colour", accent],
    ] as const) {
      if (value != null && value !== "" && normaliseHex(value) === null) {
        return NextResponse.json(
          { error: `${label} is not a valid colour.` },
          { status: 400 }
        );
      }
    }
    if (primary && accent) {
      const errors = checkColours(primary, accent).filter((w) => w.level === "error");
      if (errors.length) {
        return NextResponse.json({ error: errors[0].message }, { status: 400 });
      }
    }

    let stored = await getStoredBranding();

    if (removeExistingLogo) {
      stored = await removeLogo();
    } else if (typeof logoDataUrl === "string" && logoDataUrl.startsWith("data:")) {
      // [\s\S] rather than the /s flag, which this tsconfig target rejects.
      const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(logoDataUrl);
      if (!match) {
        return NextResponse.json(
          { error: "That image could not be read." },
          { status: 400 }
        );
      }
      const [, contentType, b64] = match;
      if (!ACCEPTED[contentType]) {
        return NextResponse.json(
          { error: "The crest must be a PNG, JPG, WEBP or SVG." },
          { status: 400 }
        );
      }
      const bytes = Buffer.from(b64, "base64");
      if (bytes.length === 0) {
        return NextResponse.json({ error: "That image is empty." }, { status: 400 });
      }
      // Checked on the SERVER as well as in the form. The form's check is a
      // courtesy; this one is the rule.
      if (bytes.length > MAX_LOGO_BYTES) {
        return NextResponse.json(
          { error: "The crest must be under 2MB." },
          { status: 400 }
        );
      }
      stored = await saveLogo(bytes, contentType, String(body.logoFilename || "logo"));
    }

    const next = await saveStoredBranding({
      ...stored,
      ...(fullName !== undefined ? { fullName: String(fullName).trim() } : {}),
      ...(shortName !== undefined ? { shortName: String(shortName).trim() } : {}),
      ...(primary ? { primary: normaliseHex(primary)! } : {}),
      ...(accent ? { accent: normaliseHex(accent)! } : {}),
      ...(replyTo !== undefined ? { replyTo: String(replyTo).trim() } : {}),
    });

    // Hand back what was saved. A re-read moments after a write can still serve
    // the previous copy, which would make a correct save look like it failed.
    return NextResponse.json(next);
  } catch (err) {
    console.error("[branding] Save failed:", err);
    return NextResponse.json(
      { error: "Could not save the branding." },
      { status: 500 }
    );
  }
}
