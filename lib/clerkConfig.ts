// ---------------------------------------------------------------------------
// Whether THIS deployment uses Clerk.
//
// One repo builds three Vercel projects. Two of them are live schools running
// the existing auth with real people signed in, and only the new shared app has
// Clerk keys. So every piece of Clerk wiring has to be inert without them —
// importing the SDK is fine, but nothing may CALL it, or HVPS and Jeppe crash
// on the next deploy.
//
// A single helper rather than `if (process.env.CLERK_SECRET_KEY)` scattered
// about, because the day one of those checks is forgotten is the day a live
// school goes down.
// ---------------------------------------------------------------------------

export function isClerkEnabled(): boolean {
  return !!(
    process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  );
}

// The publishable key is inlined at build time, so a client component cannot
// read process.env.CLERK_SECRET_KEY to decide. It gets this instead.
export function isClerkEnabledOnClient(): boolean {
  return !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

/**
 * 🔴 The cookie must NOT be shared across subdomains.
 *
 * The marketing site and every school sit under one parent domain:
 *
 *     schoolcompliance.co.za            marketing
 *     hurlyvale.schoolcompliance.co.za  one school
 *     jeppegirls.schoolcompliance.co.za another
 *
 * A session cookie set on `.schoolcompliance.co.za` would be sent to EVERY
 * school's subdomain by the browser. That is a cross-tenant hole created by the
 * domain layout rather than by any bug in our code, and it would be invisible
 * until somebody noticed one school's session working on another's URL.
 *
 * Clerk scopes cookies to the exact host by default. This constant exists so
 * that if anybody is ever tempted to set a parent-domain cookie to make
 * "sign in once, see all your schools" work, they read this first. The right
 * way to do that is Clerk's organisation switcher, which keeps one session and
 * changes the active org — not one cookie shared across tenants.
 */
export const COOKIE_MUST_NOT_SPAN_SUBDOMAINS = true;
