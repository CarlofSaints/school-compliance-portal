import { put, del, list } from "@vercel/blob";

const PREFIX = "hvps/";

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

// In-memory cache of recent writes to avoid stale reads from Vercel Blob
const recentWrites = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 10000; // 10 seconds

export async function readJson<T>(blobPath: string, fallback: T): Promise<T> {
  // Check if we have a recent write for this path (avoids stale blob reads)
  const cached = recentWrites.get(blobPath);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data as T;
  }

  try {
    const blob = await findBlob(blobPath);
    if (blob) {
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
