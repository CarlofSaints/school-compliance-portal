import { put, del, list } from "@vercel/blob";
import { branding } from "@/lib/branding";

// Tenant-scoped blob path prefix. Each school has its own Blob store, so this
// is mainly for tidiness — HVPS stays "hvps/" (key unchanged), Jeppe → "jeppe/".
const PREFIX = `${branding.key}/`;

function blobKey(path: string): string {
  return PREFIX + path;
}

async function fetchBlob(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
    },
    cache: "no-store",
  });
}

async function findBlob(blobPath: string) {
  const result = await list({ prefix: blobKey(blobPath), limit: 1 });
  return result.blobs.find((b) => b.pathname === blobKey(blobPath)) || null;
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
  const cached = recentWrites.get(blobPath);
  const cacheUsable = cached !== undefined && Date.now() - cached.ts < CACHE_TTL;

  try {
    const blob = await findBlob(blobPath);
    if (blob) {
      // An overwrite takes a moment to propagate, so the copy we can see may
      // predate our own write. uploadedAt says which it is:
      //   newer than our write  -> another instance has written since. Use it,
      //                            or we would append to a stale list and wipe
      //                            their record.
      //   older or equal        -> either this IS our write, in which case the
      //                            cache holds the same thing, or the read is
      //                            stale and the cache is fresher. Use cache.
      if (cacheUsable && new Date(blob.uploadedAt).getTime() <= cached.ts) {
        return cached.data as T;
      }

      // Append cache-buster to avoid CDN/edge caching
      const url = blob.url + (blob.url.includes("?") ? "&" : "?") + `_t=${Date.now()}`;
      const res = await fetchBlob(url);
      if (res.ok) {
        return (await res.json()) as T;
      }
    }
  } catch {
    // blob not found
  }

  // The blob could not be read at all. If this instance wrote this path moments
  // ago, that write is better evidence than the fallback — returning the
  // fallback here is what turns a slow list() into a wiped file.
  if (cacheUsable) {
    return cached.data as T;
  }

  return fallback;
}

export async function writeJson<T>(blobPath: string, data: T): Promise<void> {
  await put(blobKey(blobPath), JSON.stringify(data, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  // Cache the write so immediate re-reads get fresh data
  recentWrites.set(blobPath, { data, ts: Date.now() });
}

export async function readFile(blobPath: string): Promise<Buffer | null> {
  try {
    const blob = await findBlob(blobPath);
    if (blob) {
      const res = await fetchBlob(blob.url);
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
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
  await put(blobKey(blobPath), Buffer.from(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function deleteFile(blobPath: string): Promise<void> {
  try {
    const blob = await findBlob(blobPath);
    if (blob) {
      await del(blob.url);
    }
  } catch {
    // ignore
  }
}

export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const result = await list({ prefix: blobKey(dirPath + "/") });
    return result.blobs.map((b) => {
      const full = b.pathname;
      const prefix = blobKey(dirPath + "/");
      const relative = full.startsWith(prefix) ? full.slice(prefix.length) : full;
      return relative.split("/")[0];
    }).filter((name) => name.length > 0);
  } catch {
    return [];
  }
}
