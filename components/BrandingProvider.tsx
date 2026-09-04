"use client";

import { createContext, useContext } from "react";
import { branding as codeBranding, type SchoolBranding } from "@/lib/branding";

// ---------------------------------------------------------------------------
// Branding for client components.
//
// lib/branding.ts is resolved at BUILD time from NEXT_PUBLIC_SCHOOL, so a
// client component that imports it directly can never show a crest or a name
// the school changed after the deploy — and on a shared deployment serving many
// schools it would show the same one to all of them.
//
// The server resolves the real branding per request and seeds this. The
// built-in value stays as the fallback so a component rendered outside the
// provider still renders something sensible rather than crashing.
// ---------------------------------------------------------------------------

const BrandingContext = createContext<SchoolBranding>(codeBranding);

export function BrandingProvider({
  value,
  children,
}: {
  value: SchoolBranding;
  children: React.ReactNode;
}) {
  return (
    <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
  );
}

/** The school this page is for. Use this in any "use client" component instead
 *  of importing `branding` from lib/branding. */
export function useBranding(): SchoolBranding {
  return useContext(BrandingContext);
}
