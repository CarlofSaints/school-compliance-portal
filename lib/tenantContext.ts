import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";
import { branding } from "@/lib/branding";
import { normaliseHostname, type ResolvedTenant } from "@/lib/tenant";
import {
  isMultiTenant,
  resolveTenantForHost,
  getTenantByKey,
} from "@/lib/tenantRegistry";
import { open } from "@/lib/secretBox";

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
  try {
    // headers() is read FIRST, before the multi-tenant check, and that ordering
    // is deliberate rather than tidy.
    //
    // Reading headers is what tells Next.js a page depends on the request. With
    // the isMultiTenant() check first, a single-school deployment never touched
    // headers at all, so /login was PRERENDERED AT BUILD TIME — with whatever
    // branding existed then, which is none, because a build has no blob access.
    // A school could upload its crest, save, and see nothing change until the
    // next deploy.
    //
    // It also has to be true for multi-tenancy to work at all: the same HTML
    // cannot be served to two schools on two hostnames.
    const hostname = await requestHostname();
    if (!isMultiTenant()) return null;
    if (!hostname) return null;
    return await resolveTenantForHost(hostname);
  } catch {
    // headers() throws outside a request — a build step, or a script. Not an
    // error, just not a request.
    return null;
  }
}

// An explicit scope, set for the duration of one call, that overrides the one
// the request would otherwise imply.
//
// This exists for exactly one caller: the platform admin portal, where Carl
// looks at a school OTHER than the one the hostname names. Everything else must
// go on resolving from the request, so AsyncLocalStorage is used rather than a
// parameter: it cannot leak past the callback, it cannot be left switched on,
// and it needs no change to any of the 133 data call sites.
//
// 🔴 Anything running inside runAsTenant reads and WRITES another school's
// store. It must only ever be reachable behind the platform admin check.
const override = new AsyncLocalStorage<TenantScope>();

/**
 * Runs `fn` against a named school's store.
 *
 * Throws if the tenant is unknown or has no stored credential, rather than
 * silently falling back to the current request's school. A quiet fallback here
 * would mean an admin who asked for school A being shown school B, which is the
 * single worst thing this codebase could do.
 */
export async function runAsTenant<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const tenant = await getTenantByKey(key);
  if (!tenant) throw new Error(`No school with the address "${key}".`);
  if (!tenant.blobTokenSealed) {
    throw new Error(`School "${key}" has no stored credential.`);
  }
  return override.run(
    {
      prefix: `${tenant.key}/`,
      token: open(tenant.blobTokenSealed),
      key: tenant.key,
      fromRegistry: true,
    },
    fn
  );
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
  // An explicit scope always wins. Checked FIRST so a platform admin reading
  // school A over school B's hostname cannot be handed B's data.
  const forced = override.getStore();
  if (forced) return forced;

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
/** The hostname Carl's own portal answers on. Exempt from the stray-host
 *  page, because the platform belongs to no school and the registry will
 *  never know it. */
export function platformHostname(): string {
  return (process.env.PLATFORM_HOSTNAME || "").trim().toLowerCase();
}

export async function unknownHostname(): Promise<string | null> {
  if (!isMultiTenant()) return null;
  try {
    const hostname = await requestHostname();
    if (!hostname) return null;
    // Carl's own portal, on every path including the sign-in it bounces to.
    if (hostname === platformHostname()) return null;
    if (await resolveTenantForHost(hostname)) return null;
    return hostname;
  } catch {
    return null;
  }
}

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
