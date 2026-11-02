import { list, get, put } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createBlobStore, deleteBlobStore } from "./vercelApi";
import { createTenant, getTenantByKey, updateTenant, isTenantKeyAvailable, isHostnameAvailable } from "./tenantRegistry";
import { seal, open } from "./secretBox";
import type { Tenant } from "./tenant";

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
// copy every file (in batches, safe to repeat), apply the built-in branding,
// compare counts, sign in on the test address, then add the real address.
// ---------------------------------------------------------------------------

const BATCH = 100;

/**
 * 🔴 Two-step sign-in secrets are sealed with the OLD app's signing key, so on
 * the shared app they could never be opened and the Super Admin would be
 * locked out. They are left behind: the next sign-in asks to set it up again.
 */
const leftBehind = (p: string) => /(^|\/)users\/[^/]+\/mfa\.json$/.test(p);

export class MoveError extends Error {}

function tenantToken(t: Tenant | null): string {
  if (!t?.blobTokenSealed) throw new MoveError("That school has no store yet. Create it first.");
  return open(t.blobTokenSealed);
}

/** Step 1: the empty school, its own store, answering on a TEST address only. */
export async function createMovedSchool(key: string, name: string, testHostname: string): Promise<Tenant> {
  if (!(await isTenantKeyAvailable(key))) throw new MoveError(`A school with the key "${key}" already exists.`);
  if (!(await isHostnameAvailable(testHostname))) throw new MoveError(`${testHostname} is already taken.`);
  const store = await createBlobStore(`school-${key}`);
  const tenant: Tenant = {
    key,
    name,
    hostnames: [testHostname],
    blobStoreId: store.storeId,
    blobTokenSealed: seal(store.token),
    status: "active",
    createdAt: new Date().toISOString(),
    branding: { fullName: name },
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
 * Step 2: one batch of files from the old store (`sourcePrefix`, e.g.
 * "jeppe/") into the school's store under "<key>/". Same relative paths, so
 * every record, file and own-copy lands where the app looks for it.
 * Overwrites, so it can be run again to pick up anything changed since.
 */
export async function copyBatch(sourceToken: string, sourcePrefix: string, key: string, cursor?: string) {
  const target = tenantToken(await getTenantByKey(key));
  const page = await list({ prefix: sourcePrefix, limit: BATCH, cursor, token: sourceToken });
  let bytes = 0;
  let skipped = 0;
  for (const blob of page.blobs) {
    if (leftBehind(blob.pathname)) {
      skipped++;
      continue;
    }
    const got = await get(blob.pathname, { access: "private", useCache: false, token: sourceToken });
    if (!got) continue;
    const data = Buffer.from(await new Response(got.stream).arrayBuffer());
    await put(`${key}/${blob.pathname.slice(sourcePrefix.length)}`, data, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: got.blob.contentType || "application/octet-stream",
      token: target,
    });
    bytes += data.length;
  }
  return { copied: page.blobs.length - skipped, skipped, bytes, cursor: page.cursor, hasMore: page.hasMore };
}

async function countPrefix(token: string, prefix: string) {
  let files = 0;
  let bytes = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, limit: 1000, cursor, token });
    const kept = page.blobs.filter((b) => !leftBehind(b.pathname));
    files += kept.length;
    bytes += kept.reduce((n, b) => n + b.size, 0);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return { files, bytes };
}

/** Step 4: the old and new side, file count and size. Also what the old
 *  store holds OUTSIDE the prefix, so nothing is silently left behind. */
export async function compare(sourceToken: string, sourcePrefix: string, key: string) {
  const target = tenantToken(await getTenantByKey(key));
  const [source, everything, moved] = await Promise.all([
    countPrefix(sourceToken, sourcePrefix),
    countPrefix(sourceToken, ""),
    countPrefix(target, `${key}/`),
  ]);
  return { source, outsidePrefix: everything.files - source.files, moved };
}

/**
 * Step 3: the old app's built-in look (colours, short name, crest), written
 * into the school's own branding, WITHOUT overwriting anything the school had
 * already saved itself (its copied branding.json wins).
 */
export async function applyBuiltInBranding(
  key: string,
  look: { fullName: string; shortName: string; primary: string; accent: string; logoFile: string }
) {
  const target = tenantToken(await getTenantByKey(key));
  const brandingPath = `${key}/branding.json`;
  const existing = await get(brandingPath, { access: "private", useCache: false, token: target }).catch(() => null);
  const saved = existing ? JSON.parse(await new Response(existing.stream).text()) : {};
  const next: Record<string, unknown> = {
    fullName: look.fullName,
    shortName: look.shortName,
    primary: look.primary,
    accent: look.accent,
    ...saved,
  };
  if (!saved.logo) {
    // The crest that ships with the old app (public/), traced into the functions.
    const crest = await readFile(path.join(process.cwd(), "public", path.basename(look.logoFile)));
    await put(`${key}/branding/logo`, crest, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "image/png", token: target });
    next.logo = { contentType: "image/png", filename: path.basename(look.logoFile), version: Date.now(), updatedAt: new Date().toISOString() };
  }
  await put(brandingPath, JSON.stringify(next, null, 2), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", token: target });
  return next;
}

/** Step 5: the school answers on an extra address (the real one), or stops answering on one. */
export async function setHostnames(key: string, hostnames: string[]) {
  const t = await getTenantByKey(key);
  if (!t) throw new MoveError("No such school.");
  await updateTenant({ ...t, hostnames });
  return hostnames;
}
