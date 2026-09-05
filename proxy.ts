import { NextRequest, NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { isClerkEnabled } from "@/lib/clerkConfig";

// ---------------------------------------------------------------------------
// Named proxy.ts, not middleware.ts: Next 16 deprecated the middleware file
// convention and warns on build.
//
// 🔴 This file runs on EVERY request to all three deployments, two of which are
// live schools with real people signed in.
//
// clerkMiddleware() throws when there are no Clerk keys, so it is built ONCE at
// module load only if this deployment has them, and otherwise never touched.
// Calling it unconditionally would take HVPS and Jeppe down on the next push.
//
// Deliberately does no authorisation yet. Clerk is being introduced underneath
// the existing auth, not on top of it: this establishes the session so the app
// can start reading it, while the current permission checks stay in charge.
// Swapping the two over is a separate, deliberate step.
// ---------------------------------------------------------------------------

const withClerk = isClerkEnabled() ? clerkMiddleware() : null;

export default function proxy(req: NextRequest, event: never) {
  if (!withClerk) return NextResponse.next();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (withClerk as any)(req, event);
}

export const config = {
  matcher: [
    // Everything except Next's internals and static files, which is the shape
    // Clerk expects. The negative lookahead keeps the crest, the favicon and
    // the JS bundles off this path entirely - they need no session, and making
    // every asset wake the auth layer costs latency on every page.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
