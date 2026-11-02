import { list, get, put, del } from "@vercel/blob";
import { createBlobStore, deleteBlobStore } from "./vercelApi";
import type { ListBlobResultBlob } from "@vercel/blob";
import { createTenant, getTenantByKey, updateTenant, isTenantKeyAvailable, isHostnameAvailable } from "./tenantRegistry";
import { seal, open } from "./secretBox";
import { SCHOOLS } from "./branding";
import { normaliseHostname, type Tenant } from "./tenant";

// ---------------------------------------------------------------------------
// Moving a school that has its OWN deployment (Jeppe, then HVPS) onto the
// shared multi-tenant app. Carl: "let's move jeppe. if it all goes well, then
// we can look to move HVPS".
//
// 🔴 The old deployment is only ever READ: its store is listed and copied,
// never written or deleted, so stopping half way (or rolling back) costs
// nothing - the old app keeps working exactly as before until its web
// address is moved.
//
// The source token is pasted into the platform page for each run and used for
// that request only: never stored, never logged.
//
// Steps (app/platform/move-school): create the empty school on a TEST address,
// set its built-in look, copy every file (in batches, safe to repeat - each
// full copy ends by removing what the old side no longer has), compare, sign
// in on the test address, then add the real address.
// ---------------------------------------------------------------------------

/** Files per request: small enough that a batch of scanned PDFs finishes well
 *  inside the 120 s limit; the page resumes from the last cursor on failure. */
const BATCH = 25;

/**
 * 🔴 Two-step sign-in records are sealed with the OLD app's signing key, so on
 * the shared app the authenticator could never be checked. They are left
 * behind, and kept on the new side: the Super Admin sets it up again at the
 * first sign-in, and that new set-up must never be pruned by a later copy.
 */
const isMfa = (rel: string) => /^users\/[^/]+\/mfa\.json$/.test(rel);

export class MoveError extends Error {}

/** 🔴 Only a school with its OWN deployment can be moved: never a self-serve
 *  school (a prune there would empty its store), never "generic", never a key
 *  like "constructor" that a plain object lookup would accept. */
export function isMovableKey(key: string): boolean {
  return Object.hasOwn(SCHOOLS, key) && key !== "generic";
}

export const realHostname = (key: string) => `${key}.schoolcompliance.co.za`;

/** Live = the moved school answers on its real address (taking it off again
 *  is the rollback, and unlocks copying). */
export const isLive = (t: Tenant) => t.hostnames.map(normaliseHostname).includes(realHostname(t.key));

/**
 * 🔴 The ONE gate for every step after Create: the school record must be one
 * THIS tool made (builtInLook === key). The key alone is not enough: "hvps" or
 * "jeppe" are not reserved, so a self-serve school could own either, and a
 * copy or prune there would overwrite or delete its files.
 */
async function movedTenant(key: string, { beforeSwitch = false } = {}) {
  if (!isMovableKey(key)) throw new MoveError(`"${key}" is not a school with its own deployment.`);
  const t = await getTenantByKey(key);
  if (!t) throw new MoveError("That school has not been created yet. Run step 1 first.");
  if (t.builtInLook !== key || !t.blobTokenSealed) {
    throw new MoveError(`The school "${key}" on the shared app was not made by this tool, so it is left alone.`);
  }
  if (beforeSwitch && isLive(t)) {
    throw new MoveError("This school already runs on the shared app on its real address. Copying now would overwrite what people have done there since, so it is refused. (To roll back, take the real address off first.)");
  }
  return { tenant: t, token: open(t.blobTokenSealed) };
}

/** Step 1: the empty school, its own store, answering on a TEST address only. */
export async function createMovedSchool(key: string, testHostname: string): Promise<Tenant> {
  if (!isMovableKey(key)) throw new MoveError(`"${key}" is not a school with its own deployment.`);
  const look = SCHOOLS[key];
  if (!(await isTenantKeyAvailable(key))) throw new MoveError(`A school with the key "${key}" already exists.`);
  if (!(await isHostnameAvailable(testHostname))) throw new MoveError(`${testHostname} is already taken.`);
  const store = await createBlobStore(`school-${key}`);
  const tenant: Tenant = {
    key,
    name: look.fullName,
    hostnames: [testHostname],
    blobStoreId: store.storeId,
    blobTokenSealed: seal(store.token),
    status: "active",
    createdAt: new Date().toISOString(),
    // Its exact built-in look (colours, words, crest) is the base every page
    // and email starts from (lib/brandingData.ts), named here and read live
    // from SCHOOLS so later fixes reach it. Copying files never touches it.
    builtInLook: key,
  };
  try {
    await createTenant(tenant);
  } catch (err) {
    await deleteBlobStore(store.storeId).catch(() => {});
    throw err;
  }
  return tenant;
}

/**
 * Step 2: one batch of files from the old store (`<key>/`) into the school's
 * store under the same path. Overwrites, so it can be run again.
 */
export async function copyBatch(sourceToken: string, key: string, cursor?: string) {
  const { token: target } = await movedTenant(key, { beforeSwitch: true });
  const prefix = `${key}/`;
  const page = await list({ prefix, limit: BATCH, cursor, token: sourceToken });
  let copied = 0;
  let skipped = 0;
  let bytes = 0;
  for (const blob of page.blobs) {
    if (isMfa(blob.pathname.slice(prefix.length))) {
      skipped++;
      continue;
    }
    const got = await get(blob.pathname, { access: "private", useCache: false, token: sourceToken });
    if (!got) continue; // deleted since it was listed: nothing to copy
    const data = Buffer.from(await new Response(got.stream).arrayBuffer());
    await put(blob.pathname, data, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: got.blob.contentType || "application/octet-stream",
      token: target,
    });
    copied++;
    bytes += data.length;
  }
  return { copied, skipped, bytes, cursor: page.cursor, hasMore: page.hasMore };
}

async function listAll(token: string, prefix: string) {
  const out = new Map<string, ListBlobResultBlob>();
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, limit: 1000, cursor, token });
    for (const b of page.blobs) out.set(b.pathname, b);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/**
 * The end of every full copy: removes from the new side anything the old side
 * no longer has (minutes deleted between two copies would otherwise come back).
 * Never the new side's own two-step sign-in set-ups.
 */
export async function pruneRemoved(sourceToken: string, key: string): Promise<number> {
  const { token: target } = await movedTenant(key, { beforeSwitch: true });
  const prefix = `${key}/`;
  const [source, moved] = await Promise.all([listAll(sourceToken, prefix), listAll(target, prefix)]);
  const kept = [...moved.keys()].filter((p) => !isMfa(p.slice(prefix.length)));
  const gone = kept.filter((p) => !source.has(p));
  // 🔴 A wrong token (an empty, test or stale store) must never empty the new
  // side: refused when the old side has no real files, or when more than a
  // quarter of the new side would go - far more than a day's deletions.
  const sourceFiles = [...source.keys()].filter((p) => !isMfa(p.slice(prefix.length))).length;
  if (sourceFiles === 0 || (gone.length > 5 && gone.length > kept.length / 4)) {
    throw new MoveError(`That would remove ${gone.length} of ${kept.length} files, which looks like the wrong token for this school. Nothing was removed.`);
  }
  // In chunks: one request, not hundreds, so a big prune finishes in time.
  for (let i = 0; i < gone.length; i += 100) await del(gone.slice(i, i + 100), { token: target });
  return gone.length;
}

/** Step 3: old and new compared file by file (path and size), and anything in
 *  the old store OUTSIDE its folder, so nothing is silently left behind. */
export async function compare(sourceToken: string, key: string) {
  const { token: target } = await movedTenant(key);
  const prefix = `${key}/`;
  const [everything, moved] = await Promise.all([listAll(sourceToken, ""), listAll(target, prefix)]);
  let files = 0;
  let bytes = 0;
  let outsidePrefix = 0;
  const missing: string[] = [];
  const differentSize: string[] = [];
  const changedSince: string[] = [];
  for (const [p, blob] of everything) {
    if (!p.startsWith(prefix)) {
      outsidePrefix++;
      continue;
    }
    if (isMfa(p.slice(prefix.length))) continue;
    files++;
    bytes += blob.size;
    const copy = moved.get(p);
    if (!copy) missing.push(p.slice(prefix.length));
    else if (copy.size !== blob.size) differentSize.push(p.slice(prefix.length));
    // Same size is not the same file: an edit after the copy (newer on the old side).
    else if (new Date(blob.uploadedAt).getTime() > new Date(copy.uploadedAt).getTime()) changedSince.push(p.slice(prefix.length));
  }
  const movedKept = [...moved.entries()].filter(([p]) => !isMfa(p.slice(prefix.length)));
  const extra = [...moved.keys()].filter((p) => !everything.has(p) && !isMfa(p.slice(prefix.length))).map((p) => p.slice(prefix.length));
  return {
    source: { files, bytes },
    // Totals without two-step set-ups on either side, so identical reads identical.
    moved: { files: movedKept.length, bytes: movedKept.reduce((a, [, b]) => a + b.size, 0) },
    outsidePrefix,
    missing: missing.slice(0, 20),
    missingCount: missing.length,
    differentSize: differentSize.slice(0, 20),
    changedSince: changedSince.slice(0, 20),
    extra: extra.slice(0, 20),
    same: missing.length === 0 && differentSize.length === 0 && changedSince.length === 0 && extra.length === 0,
  };
}

/** Step 5: the school answers on an extra address (the real one), or stops answering on one. */
export async function setHostnames(key: string, hostnames: string[]) {
  const { tenant } = await movedTenant(key);
  const clean = [...new Set(hostnames.map(normaliseHostname).filter(Boolean))];
  if (!clean.length) throw new MoveError("A school needs at least one address.");
  await updateTenant({ ...tenant, hostnames: clean });
  return clean;
}

/** For the page: whether it exists, was made here, and is live. */
export async function moveStatus(key: string) {
  const t = await getTenantByKey(key);
  return { exists: !!t, ours: !!t && t.builtInLook === key, live: !!t && isLive(t), hostnames: t?.hostnames ?? [] };
}
