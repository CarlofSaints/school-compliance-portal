import crypto from "node:crypto";
import { readFile, writeFile } from "./controlData";

// Pictures pasted into a minutes section (lib/minutesBody.ts has the format).
// Stored by the SHA-256 of their bytes, beside the minutes they belong to, so
// deleting the minutes (which sweeps minutes/<id>/) removes them too.

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // the request limit is ~4.5 MB

/** PNG or JPEG by their first bytes, never by a name or a type the browser claims. */
export function imageKind(bytes: Uint8Array): "png" | "jpg" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
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
