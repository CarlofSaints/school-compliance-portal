import { put, del, list, get } from "@vercel/blob";
import { tenantScope } from "@/lib/tenantContext";

// 🔴 EVERY blob call in this file is scoped PER REQUEST, and this is the only
// module (besides the backup route) allowed to touch @vercel/blob directly.
//
// The scope carries two things and both matter:
//   prefix — the path every key sits under
//   token  — WHICH STORE, because each school has its own
//
// The token is the real isolation. A prefix bug inside one store would be bad;
// two schools sharing a store would make that bug a data leak. They do not
// share one. The prefix is belt to the token's braces.
//
// On a single-school deployment (HVPS and Jeppe today) the scope resolves to
// that deployment's own school and an undefined token, which means "use
// BLOB_READ_WRITE_TOKEN" — precisely the old behaviour.
async function scope() {
  return tenantScope();
}


// Still needed by deleteFile, which needs a blob's URL rather than its bytes.
// Nothing should READ through this — see readBlobBody below for why.
async function findBlob(blobPath: string) {
  const { prefix, token } = await scope();
  const key = prefix + blobPath;
  const result = await list({ prefix: key, limit: 1, token });
  return result.blobs.find((b) => b.pathname === key) || null;
}

// Reads a blob's bytes CONSISTENTLY — the freshly written copy, every time.
//
// This replaced list() + fetch(blob.url). That pair looks like a read but it is
// really two: list() hands back a URL from an index that lags a write, and the
// CDN then serves that URL from cache. Appending a ?_t= cache-buster did not
// help, because the stale URL is stale before the query string is even
// considered. Measured against the live store, eight writes each followed
// immediately by a read: list() + fetch() returned the wrong version FIVE
// times, and got stuck re-serving the same old copy over and over. The same
// call through get({ useCache: false }) was correct eight times out of eight.
//
// That one behaviour is behind a whole run of bugs in this project: an account
// that could not log in for the first minute of its life, a reset link that
// could be used twice, a saved record that read back as its old self, and —
// worst — read-modify-write callers that read a stale list, appended to it, and
// saved it back over newer records. Anything that reads to then write MUST come
// through here.
//
// get() also needs no separate index lookup, so it is one round trip, not two.
async function readBlobBody(blobPath: string): Promise<Response | null> {
  const { prefix, token } = await scope();
  const result = await get(prefix + blobPath, {
    access: "private",
    // The whole point. Straight from origin storage, never the CDN copy.
    useCache: false,
    token,
  });
  if (!result) return null;
  return new Response(result.stream);
}

// Last-resort record of what THIS instance last wrote, per path.
//
// It exists for one narrow case: list() can lag a few hundred ms behind a put()
// for a path that has never existed before, so a read straight after the very
// first write can find nothing and hand back the fallback — an empty array,
// which a read-modify-write caller would then save over the top of real data.
//
// It is deliberately NOT a read cache. It used to be returned in preference to
// the blob for 10 seconds, and that silently destroyed data: this Map lives in
// one serverless instance's memory, so instance A would serve its own snapshot
// from before instance B's write, append to it, and save — wiping B's record.
// Uploading nine policies one after another left four, because each upload can
// land on a different instance. The blob is the truth; only fall back to this
// when the blob genuinely cannot be read.
const recentWrites = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 10000; // 10 seconds

export async function readJson<T>(blobPath: string, fallback: T): Promise<T> {
  try {
    const res = await readBlobBody(blobPath);
    if (res) {
      return (await res.json()) as T;
    }
  } catch {
    // blob not found
  }

  // The blob could not be read at all. If this instance wrote this path moments
  // ago, that write is better evidence than the fallback — returning the
  // fallback here is what turns a slow list() into a wiped file.
  //
  // Note this is the ONLY thing the map is for. Do not be tempted to return it
  // ahead of a successful blob read to make a save look instant: an overwrite
  // can take a second or two to propagate, so a route that saves and then reads
  // back may still see the old copy. Fix that where it happens, by returning
  // what was just written (see app/api/settings/approval/route.ts), rather than
  // here — reading this map in preference to the blob is what wiped records.
  const cached = recentWrites.get(blobPath);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data as T;
  }

  return fallback;
}

export async function writeJson<T>(blobPath: string, data: T): Promise<void> {
  const { prefix, token } = await scope();
  await put(prefix + blobPath, JSON.stringify(data, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  });
  // Cache the write so immediate re-reads get fresh data
  recentWrites.set(blobPath, { data, ts: Date.now() });
}

export async function readFile(blobPath: string): Promise<Buffer | null> {
  try {
    const res = await readBlobBody(blobPath);
    if (res) {
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  } catch {
    // blob not found
  }
  return null;
}

export async function writeFile(
  blobPath: string,
  data: Buffer | Uint8Array
): Promise<void> {
  const { prefix, token } = await scope();
  await put(prefix + blobPath, Buffer.from(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  });
}

export async function deleteFile(blobPath: string): Promise<void> {
  try {
    const { token } = await scope();
    const blob = await findBlob(blobPath);
    if (blob) {
      await del(blob.url, { token });
    }
  } catch {
    // ignore
  }
}

export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const { prefix: tenantPrefix, token } = await scope();
    // Resolved ONCE. The old version rebuilt the prefix inside the map, so
    // every row paid for it; now it is also an await, which cannot go there.
    const prefix = tenantPrefix + dirPath + "/";
    const result = await list({ prefix, token });
    return result.blobs.map((b) => {
      const full = b.pathname;
      const relative = full.startsWith(prefix) ? full.slice(prefix.length) : full;
      return relative.split("/")[0];
    }).filter((name) => name.length > 0);
  } catch {
    return [];
  }
}
