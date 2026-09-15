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

// The pathname, published as a header so a server layout can read it.
function withPathname(req: NextRequest): Headers {
  const h = new Headers(req.headers);
  h.set("x-pathname", req.nextUrl.pathname);
  return h;
}
// The handler form, so Clerk establishes the session AND the pathname
// header is set on the way through. Both branches must set it: the Clerk
// branch is the multi-tenant app, which is the only place the header is
// actually needed.
const withClerk = isClerkEnabled()
  ? clerkMiddleware((_auth, req) =>
      NextResponse.next({ request: { headers: withPathname(req) } })
    )
  : null;


/**
 * Sends a page visit on the project's *.vercel.app address to the school's real
 * domain, keeping the path and query.
 *
 * Carl: get rid of the Vercel URL "and ensure all users are directed to the
 * proper domain". A redirect rather than removing the address, so an old
 * bookmark lands on the right site instead of an error page.
 *
 * 🔴 OPT-IN, by REDIRECT_VERCEL_APP_TO_SITE_URL on the project. This file runs
 * on every deployment of this repo, including the multi-tenant platform, whose
 * vercel.app address is a real front door (see platformHostnames). Deciding
 * from guesses about the environment would one day redirect the wrong app;
 * a flag nobody set simply does nothing.
 *
 * Deliberately left alone:
 * - /api/*: the cron job and every fetch from a page already open on the old
 *   address. A redirected fetch loses its x-user-id header and fails.
 * - anything but GET/HEAD: a 308 would replay a form POST at the other domain.
 * - preview deployments: those URLs are for testing a specific build.
 *
 * ⚠️ The login is held in localStorage, which belongs to one address, so a
 * person arriving from the old address signs in once on the new one.
 */
function vercelAppRedirect(req: NextRequest): NextResponse | null {
  if (process.env.REDIRECT_VERCEL_APP_TO_SITE_URL !== "1") return null;
  if (process.env.VERCEL_ENV !== "production") return null;
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  if (req.nextUrl.pathname.startsWith("/api/")) return null;

  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!host.endsWith(".vercel.app")) return null;

  let site: URL;
  try {
    site = new URL(process.env.NEXT_PUBLIC_SITE_URL || "");
  } catch {
    return null;
  }
  // Never redirect to itself or to another vercel.app address: a site URL
  // still set to the old address would otherwise loop forever.
  if (site.hostname.toLowerCase() === host || site.hostname.endsWith(".vercel.app")) {
    return null;
  }

  const target = new URL(req.nextUrl.pathname + req.nextUrl.search, site.origin);
  return NextResponse.redirect(target, 308);
}

export default function proxy(req: NextRequest, event: never) {
  const redirect = vercelAppRedirect(req);
  if (redirect) return redirect;

  if (!withClerk) {
    return NextResponse.next({ request: { headers: withPathname(req) } });
  }
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
