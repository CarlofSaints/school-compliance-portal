import { headers } from "next/headers";
import { branding } from "@/lib/branding";
import { normaliseHostname, type ResolvedTenant } from "@/lib/tenant";
import { isMultiTenant, resolveTenantForHost } from "@/lib/tenantRegistry";

// ---------------------------------------------------------------------------
// Which school is THIS request for?
//
// The data layer has 133 call sites across 21 modules. Threading a tenant
// argument through all of them would be 133 chances to forget one, and a
// forgotten one reads another school's data. So the scope is resolved where the
// blob call actually happens, from the request itself, and readJson/writeJson
// keep their existing signatures.
//
// Deliberately BACKWARDS COMPATIBLE. A deployment with no control store — which
// is both live schools today — resolves to its own NEXT_PUBLIC_SCHOOL and its
// own BLOB_READ_WRITE_TOKEN, exactly as before. Nothing about HVPS or Jeppe
// changes until they are migrated.
// ---------------------------------------------------------------------------

export interface TenantScope {
  /** Blob path prefix, always ending in "/". */
  prefix: string;
  /** Which store to talk to. undefined = this deployment's own env token,
   *  which is the single-tenant case. */
  token?: string;
  key: string;
  /** False when we fell back to the deployment's own school. */
  fromRegistry: boolean;
}

/** The hostname this request arrived on. x-forwarded-host wins because behind
 *  Vercel's proxy `host` can be the internal one. */
async function requestHostname(): Promise<string> {
  const h = await headers();
  return normaliseHostname(h.get("x-forwarded-host") || h.get("host"));
}

/**
 * Resolves the tenant for the current request, or null.
 *
 * Returns null rather than throwing when there is no request to read — a build
 * step, a script, or anything else outside a request scope. Callers fall back
 * to the single-tenant path, which is what those contexts want anyway.
 */
export async function currentTenant(): Promise<ResolvedTenant | null> {
  if (!isMultiTenant()) return null;
  try {
    const hostname = await requestHostname();
    if (!hostname) return null;
    return await resolveTenantForHost(hostname);
  } catch {
    // headers() throws outside a request. Not an error, just not a request.
    return null;
  }
}

/**
 * The scope every blob call runs under.
 *
 * 🔴 This is THE isolation choke point. One school's data never reaching
 * another rests entirely on this function and on nothing else calling the blob
 * SDK directly. lib/controlData.ts and app/api/admin/backup/route.ts are the
 * only two modules allowed to, and both go through here.
 */
export async function tenantScope(): Promise<TenantScope> {
  const tenant = await currentTenant();
  if (tenant) {
    return {
      prefix: `${tenant.key}/`,
      token: tenant.blobToken,
      key: tenant.key,
      fromRegistry: true,
    };
  }
  // Single-tenant fallback: this deployment IS one school.
  return {
    prefix: `${branding.key}/`,
    token: undefined,
    key: branding.key,
    fromRegistry: false,
  };
}

/**
 * True when this request arrived on a hostname the registry does not know.
 *
 * Only meaningful on a multi-tenant deployment. It exists so the app can serve
 * a plain "no school at this address" page rather than quietly falling back to
 * the generic branding and an empty store, which would look like a school whose
 * data had vanished.
 */
export async function isUnknownHost(): Promise<boolean> {
  if (!isMultiTenant()) return false;
  try {
    const hostname = await requestHostname();
    if (!hostname) return false;
    return (await resolveTenantForHost(hostname)) === null;
  } catch {
    return false;
  }
}
