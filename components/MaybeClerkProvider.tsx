"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { isClerkEnabledOnClient } from "@/lib/clerkConfig";

// ---------------------------------------------------------------------------
// 🔴 ClerkProvider THROWS without a publishable key.
//
// One repo builds three Vercel projects and only the shared app has Clerk keys.
// Putting <ClerkProvider> unconditionally in the root layout would take HVPS
// and Jeppe down on the next deploy, on the component that wraps every page.
//
// The check reads NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, which is inlined at build
// time, so each deployment resolves this at build and the branch is decided
// before a browser ever runs it.
// ---------------------------------------------------------------------------

export default function MaybeClerkProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isClerkEnabledOnClient()) return <>{children}</>;
  return <ClerkProvider>{children}</ClerkProvider>;
}
