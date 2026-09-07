import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isClerkEnabled } from "@/lib/clerkConfig";

// ---------------------------------------------------------------------------
// The gate on Carl's own cross-school portal.
//
// 🔴 This is the most dangerous surface in the product. Everything behind it
// can read ANY school's data: their policies, their spend, their people, their
// audit trail. A school's own admin can only ever see their own school; this
// sees all of them.
//
// So it FAILS CLOSED, three times over:
//
//   1. No Clerk on this deployment      -> refused
//   2. Not signed in                    -> refused
//   3. Email not on the allow list      -> refused
//
// It deliberately does NOT reuse the portal's own permission system. That
// system is per-school and its roles are editable by school admins, so a school
// that could edit its way to a permission key would be editing its way into
// every other school. The allow list is an env var only Carl can change.
// ---------------------------------------------------------------------------

function allowedEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export interface PlatformAdmin {
  userId: string;
  email: string;
}

export type PlatformAdminResult = PlatformAdmin | NextResponse;

/**
 * Resolves the signed-in platform admin, or a response to return.
 *
 * Every failure answers 404, not 403. A 403 confirms the route exists and that
 * somebody with the right account would get in, which is an invitation. A 404
 * says nothing.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminResult> {
  const notFound = NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isClerkEnabled()) {
    // The single-school deployments have no Clerk and no business exposing
    // this at all.
    return notFound;
  }

  const allowed = allowedEmails();
  if (allowed.length === 0) {
    // An empty allow list means nobody, never everybody. A misconfigured env
    // var must not open the door.
    console.error("[platform] PLATFORM_ADMIN_EMAILS is not set; refusing.");
    return notFound;
  }

  try {
    const { userId, sessionClaims } = await auth();
    if (!userId) return notFound;

    // 🔴 The email is fetched from Clerk, NOT read off the session claims.
    //
    // This used to read `sessionClaims.email`, on the belief that Clerk puts
    // the primary email there. It does not: the default session token carries
    // sub, sid, iat and exp, and nothing about the person. So the email was
    // always empty and the gate refused EVERYONE, including the one address on
    // the allow list. It failed closed, which is the right direction to fail,
    // but it was not doing the job it looked like it was doing.
    //
    // Fetching is also the more defensible of the two: a session token is
    // minted at sign-in and keeps saying whatever it said then, so an email
    // removed from an account would still open this door until the session
    // expired. See [[session-cookie-freezes-the-role]].
    const claims = sessionClaims as Record<string, unknown> | null;
    let email = String(claims?.email || "").trim().toLowerCase();

    if (!email) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const primary = user.emailAddresses.find(
        (e) => e.id === user.primaryEmailAddressId
      );
      // 🔴 The PRIMARY address, and only if VERIFIED. Matching any address on
      // the account would let somebody add an unverified address they do not
      // control and walk in.
      if (primary?.verification?.status === "verified") {
        email = primary.emailAddress.trim().toLowerCase();
      }
    }

    if (!email || !allowed.includes(email)) {
      console.warn("[platform] Refused:", email || "(no verified primary email)");
      return notFound;
    }
    return { userId, email };
  } catch (err) {
    console.error("[platform] Auth check failed:", err);
    return notFound;
  }
}

/** Whether the platform portal should appear at all. Used by pages to render
 *  nothing rather than a broken shell on a deployment that is one school. */
export function isPlatformPortalAvailable(): boolean {
  return isClerkEnabled() && !!process.env.PLATFORM_ADMIN_EMAILS;
}
