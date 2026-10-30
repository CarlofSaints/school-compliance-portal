import { NextResponse } from "next/server";
import { contentDisposition, DOWNLOAD_CONTENT_TYPES } from "./contentDisposition";

const IMAGE_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

/** A Campus material document as a download. */
export const fileResponse = (f: { bytes: Buffer; filename: string; ext: string }) =>
  new NextResponse(new Uint8Array(f.bytes), {
    headers: {
      "Content-Type": DOWNLOAD_CONTENT_TYPES[f.ext] || IMAGE_TYPES[f.ext] || "application/octet-stream",
      "Content-Disposition": contentDisposition(f.filename),
    },
  });
