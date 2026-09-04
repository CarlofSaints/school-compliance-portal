import { NextResponse } from "next/server";
import { getStoredBranding, readLogo } from "@/lib/brandingData";

// The school's crest, served WITHOUT a login. That is deliberate, and it is the
// same reasoning that puts /logo.png under /public:
//
//  - Email clients fetch it with no session, and the crest sits at the top of
//    every message the portal sends, including the one telling somebody how to
//    set their password in the first place.
//  - The sign-in page shows it before anyone has signed in.
//
// A crest is public branding. It is a school's logo off its own letterhead, not
// a record. Nothing else in the store is reachable through here — this route
// reads exactly one fixed path and can return nothing else.
export async function GET() {
  const stored = await getStoredBranding();
  if (!stored.logo) {
    return NextResponse.json({ error: "No logo uploaded" }, { status: 404 });
  }

  const bytes = await readLogo();
  if (!bytes) {
    // The record says there is one but the bytes are gone.
    return NextResponse.json({ error: "Logo is unavailable" }, { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": stored.logo.contentType,
      // Cached hard and for a long time, because the URL carries a ?v= that
      // changes whenever the crest does. Without the version a mail client
      // would keep showing the old crest more or less forever.
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(bytes.length),

      // 🔴 An SVG is a document, not a picture. It can carry <script>, and this
      // one was uploaded by somebody else and is served from OUR origin — so a
      // link straight to it would run their script with our origin's access.
      //
      // `sandbox` drops it into an opaque origin with scripts disabled, which
      // is the standard mitigation and costs a static crest nothing. Applied to
      // every type, not just SVG, because the cost is zero and remembering to
      // special-case it is how it gets missed.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      // Stops a browser deciding a mislabelled file is really HTML.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
