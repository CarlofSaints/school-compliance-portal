import { put, head, del, list } from "@vercel/blob";

const PREFIX = "hvps/";

function blobKey(path: string): string {
  return PREFIX + path;
}

export async function readJson<T>(blobPath: string, fallback: T): Promise<T> {
  try {
    const result = await head(blobKey(blobPath));
    if (result) {
      const res = await fetch(result.url);
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
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}

export async function readFile(blobPath: string): Promise<Buffer | null> {
  try {
    const result = await head(blobKey(blobPath));
    if (result) {
      const res = await fetch(result.url);
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
    access: "public",
    addRandomSuffix: false,
  });
}

export async function deleteFile(blobPath: string): Promise<void> {
  try {
    const result = await head(blobKey(blobPath));
    if (result) {
      await del(result.url);
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
      // Return just the filename (no subdirectories)
      return relative.split("/")[0];
    }).filter((name) => name.length > 0);
  } catch {
    return [];
  }
}
