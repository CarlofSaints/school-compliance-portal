import crypto from "node:crypto";
import { readFile, writeFile } from "./controlData";
import { crestImage } from "./minutesDocx";

// Pictures pasted into a minutes section (lib/minutesBody.ts has the format).
// Stored by the SHA-256 of their bytes, beside the minutes they belong to, so
// deleting the minutes (which sweeps minutes/<id>/) removes them too.

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // the request limit is ~4.5 MB

/** PNG or JPEG by their first bytes, never by a name or a type the browser claims. */
// One reader of image headers for the whole app (the crest uses it too).
export function imageKind(bytes: Buffer): "png" | "jpg" | null {
  const t = crestImage(bytes)?.type;
  return t === "png" || t === "jpg" ? t : null;
}

const path = (minutesId: string, imageId: string) => `minutes/${minutesId}/images/${imageId}`;

export async function saveMinutesImage(minutesId: string, bytes: Buffer): Promise<string> {
  const id = crypto.createHash("sha256").update(bytes).digest("hex");
  await writeFile(path(minutesId, id), bytes);
  return id;
}

export async function readMinutesImage(minutesId: string, imageId: string): Promise<Buffer | null> {
  if (!/^[0-9a-f]{64}$/.test(imageId)) return null;
  return readFile(path(minutesId, imageId));
}
