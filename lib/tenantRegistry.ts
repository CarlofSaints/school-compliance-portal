import { put, get, list, del } from "@vercel/blob";
import {
  Tenant,
  ResolvedTenant,
  normaliseHostname,
  checkTenantKey,
} from "./tenant";
import { open, isSealingAvailable } from "./secretBox";

// ---------------------------------------------------------------------------
// The control plane: which school is this request for, and what is its store?
//
// This is the ONE store that is not a school's. It holds nothing but the tenant
// records, and it is read before we know which tenant we are serving, so it
// cannot itself be tenant-scoped. Its token is CONTROL_BLOB_READ_WRITE_TOKEN.
//
// Shape, deliberately keyed per record rather than one big list:
//   hosts/<hostname>.json   -> { key }
//   tenants/<key>.json      -> Tenant
//
// One document per key means adding a school is never a read-modify-write of a
// shared list, so two signups in the same moment cannot erase each other. That
// exact shape has already cost this project real data more than once
// ([[blob-index-append-lost-update]], [[own-copy-before-shared-index]]).
// ---------------------------------------------------------------------------

function controlToken(): string | undefined {
  return process.env.CONTROL_BLOB_READ_WRITE_TOKEN;
}

/** Whether this deployment is running in multi-tenant mode at all. A
 *  deployment with no control store is a single-school deployment (HVPS and
 *  Jeppe today) and must keep working exactly as it did. */
export function isMultiTenant(): boolean {
  return !!controlToken() && isSealingAvailable();
}

async function readControlJson<T>(path: string): Promise<T | null> {
  const token = controlToken();
  if (!token) return null;
  try {
    // Consistent read, for the same reason every other read in this codebase
    // now is: list() + fetch(url) serves a stale copy about half the time.
    // See [[vercel-blob-stale-read-root-cause]].
    const r = await get(path, { access: "private", useCache: false, token });
    if (!r) return null;
    return JSON.parse(await new Response(r.stream).text()) as T;
  } catch {
    return null;
  }
}

async function writeControlJson(path: string, data: unknown): Promise<void> {
  const token = controlToken();
  if (!token) throw new Error("CONTROL_BLOB_READ_WRITE_TOKEN is not set");
  await put(path, JSON.stringify(data, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  });
}

// Per-instance cache of resolved tenants.
//
// This caches CONFIGURATION, not anyone's data — the worst a stale entry can do
// is show a school its old display name for a minute. That is a different thing
// from caching records, which wiped data here before
// ([[per-instance-cache-beats-shared-truth]]), so the rule that a read must
// never prefer the cache does not apply to this.
//
// It is keyed by hostname, so a stale entry can never hand back the WRONG
// school — only an out-of-date version of the right one.
const CACHE_TTL = 60_000;
const cache = new Map<string, { tenant: ResolvedTenant | null; ts: number }>();

/** Drops a hostname from this instance's cache. Only affects the instance that
 *  runs it, so treat it as "sooner", not "guaranteed". */
export function forgetCachedTenant(hostname: string): void {
  cache.delete(normaliseHostname(hostname));
}

export async function getTenantByKey(key: string): Promise<Tenant | null> {
  if (checkTenantKey(key)) return null;
  return readControlJson<Tenant>(`tenants/${key}.json`);
}

export async function getTenantKeyForHost(host: string): Promise<string | null> {
  const hostname = normaliseHostname(host);
  if (!hostname) return null;
  const row = await readControlJson<{ key: string }>(`hosts/${hostname}.json`);
  return row?.key ?? null;
}

/** The whole resolution, cached: hostname -> tenant with its token opened. */
export async function resolveTenantForHost(
  host: string
): Promise<ResolvedTenant | null> {
  const hostname = normaliseHostname(host);
  if (!hostname || !isMultiTenant()) return null;

  const hit = cache.get(hostname);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.tenant;

  let resolved: ResolvedTenant | null = null;
  const key = await getTenantKeyForHost(hostname);
  if (key) {
    const tenant = await getTenantByKey(key);
    // A suspended school resolves to nothing, so it serves the same "unknown
    // site" page as a hostname that was never registered. Non-payment should
    // not read as a broken deployment.
    if (tenant && tenant.status === "active") {
      resolved = {
        key: tenant.key,
        name: tenant.name,
        clerkOrgId: tenant.clerkOrgId,
        branding: tenant.branding,
        blobToken: tenant.blobTokenSealed
          ? open(tenant.blobTokenSealed)
          : undefined,
      };
    }
  }

  cache.set(hostname, { tenant: resolved, ts: Date.now() });
  return resolved;
}

export async function listTenants(): Promise<Tenant[]> {
  const token = controlToken();
  if (!token) return [];
  const out: Tenant[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "tenants/", limit: 1000, cursor, token });
    for (const blob of page.blobs) {
      const key = blob.pathname.replace(/^tenants\//, "").replace(/\.json$/, "");
      const tenant = await getTenantByKey(key);
      if (tenant) out.push(tenant);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveTenant(tenant: Tenant): Promise<void> {
  const problem = checkTenantKey(tenant.key);
  if (problem) throw new Error(`Tenant key is ${problem}: ${tenant.key}`);
  await writeControlJson(`tenants/${tenant.key}.json`, tenant);
  for (const host of tenant.hostnames) {
    const hostname = normaliseHostname(host);
    if (hostname) {
      await writeControlJson(`hosts/${hostname}.json`, { key: tenant.key });
      forgetCachedTenant(hostname);
    }
  }
}

/** True when nobody has claimed this hostname yet, or the claim is this
 *  tenant's own. Checked BEFORE a signup writes anything, because a hostname
 *  pointing at the wrong school is how data would be shown to strangers. */
export async function isHostnameAvailable(
  host: string,
  forKey?: string
): Promise<boolean> {
  const hostname = normaliseHostname(host);
  if (!hostname) return false;
  const existing = await getTenantKeyForHost(hostname);
  return existing === null || existing === forKey;
}

export async function releaseHostname(host: string): Promise<void> {
  const token = controlToken();
  const hostname = normaliseHostname(host);
  if (!token || !hostname) return;
  try {
    const page = await list({ prefix: `hosts/${hostname}.json`, limit: 1, token });
    for (const blob of page.blobs) await del(blob.url, { token });
  } catch {
    // Nothing to release.
  }
  forgetCachedTenant(hostname);
}
