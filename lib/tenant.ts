import type { SchoolBranding } from "./branding";

// ---------------------------------------------------------------------------
// What a tenant IS.
//
// Pure types plus normalisation — no storage, no @vercel/blob, no next/headers.
// Kept clean so a client component can import the shape, and so the rules below
// can be tested with no server (scripts/check-tenant.ts).
// ---------------------------------------------------------------------------

export interface Tenant {
  /** Short key. Doubles as the blob path prefix and the branding key, so it is
   *  fixed for the life of the school — renaming it would orphan its data. */
  key: string;
  /** Display name, used before branding is loaded and in the admin list. */
  name: string;
  /** Every hostname that should serve this school. Lowercase, no port. */
  hostnames: string[];
  /** The school's OWN Vercel Blob store. Every school gets one: separation is
   *  physical, not a prefix somebody could get wrong. */
  blobStoreId?: string;
  /** Its read/write token, SEALED (see lib/secretBox.ts). Never store it bare. */
  blobTokenSealed?: string;
  /** Clerk organisation. Membership of THIS org is what authorises a person to
   *  see this school, independently of which store the hostname selected. */
  clerkOrgId?: string;
  /** Overrides on top of the branding defaults. A school can be onboarded with
   *  none of this and still work, just looking generic. */
  branding?: Partial<SchoolBranding>;
  status: "active" | "suspended";
  createdAt: string;
}

/** A tenant resolved for the current request, with its token already opened. */
export interface ResolvedTenant {
  key: string;
  name: string;
  /** Absent means "use this deployment's own BLOB_READ_WRITE_TOKEN" — the
   *  single-tenant path that HVPS and Jeppe are still on. */
  blobToken?: string;
  clerkOrgId?: string;
  branding?: Partial<SchoolBranding>;
}

/** Hostnames arrive with ports, case, trailing dots and occasionally an
 *  x-forwarded-host list. One rule, used on the way IN and on the way OUT, or
 *  a lookup misses a record that is sitting right there
 *  ([[a-string-used-as-a-join-key]]). */
export function normaliseHostname(host: string | null | undefined): string {
  if (!host) return "";
  return String(host)
    .split(",")[0] // x-forwarded-host can be a list; the first is the client's
    .trim()
    .toLowerCase()
    .replace(/\.$/, "") // fully-qualified trailing dot
    .replace(/:\d+$/, ""); // port
}

/** Keys become blob path segments, so they are deliberately strict. Anything
 *  outside this could escape its own prefix. */
export function isValidTenantKey(key: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(key);
}

// Keys that must never be handed to a school, because they would collide with
// the control plane's own paths or read as something they are not.
const RESERVED_KEYS = new Set([
  "control",
  "tenants",
  "hosts",
  "admin",
  "api",
  "www",
  "app",
  "generic",
  "public",
  "static",
  "_next",
]);

export function isReservedTenantKey(key: string): boolean {
  return RESERVED_KEYS.has(key);
}

export type TenantKeyProblem =
  | "invalid"
  | "reserved"
  | null;

export function checkTenantKey(key: string): TenantKeyProblem {
  if (!isValidTenantKey(key)) return "invalid";
  if (isReservedTenantKey(key)) return "reserved";
  return null;
}

/** Suggests a key from a school's name. Only a suggestion — the caller still
 *  has to check it is free and passes checkTenantKey. */
export function suggestTenantKey(name: string): string {
  const base = String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
  // The pattern needs at least three characters and cannot end in a hyphen.
  if (base.length < 3) return (base + "-school").slice(0, 32);
  return base;
}
