"use client";

import { useRef, useState, useEffect } from "react";
import PersonPhoto from "./PersonPhoto";

interface PhotoUploadProps {
  name: string;
  /** The photo already saved against this person, if any. */
  currentUrl?: string | null;
  /** A newly picked photo, not yet saved. */
  file: Blob | null;
  /** True when the saved photo is to be cleared on save. */
  removed: boolean;
  onPick: (file: Blob | null) => void;
  onRemove: (removed: boolean) => void;
}

// Matches the server's allow-list in /api/people/[id]/photo. A form that
// accepts more than the server does produces an upload that is refused after
// the person has already chosen it.
const ACCEPT = ".jpg,.jpeg,.png,.webp";
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const OUTPUT_SIZE = 512;

// Scales the shortest side to OUTPUT_SIZE and centre-crops to a square, then
// re-encodes as JPEG.
//
// Doing this in the browser rather than on the server means a 6MB phone
// photograph is sent as roughly 40KB. That keeps the request far below the
// platform's request body limit, keeps the blob store small, and keeps the
// directory quick to load, without a server-side image library.
async function toSquareJpeg(file: File): Promise<Blob> {
  // from-image applies the EXIF orientation, so a portrait photo off a phone is
  // not stored on its side.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not read that image."))),
      "image/jpeg",
      0.85
    );
  });
}

export default function PhotoUpload({
  name,
  currentUrl,
  file,
  removed,
  onPick,
  onRemove,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // Object URLs have to be revoked or the page leaks one per photo picked.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFile = async (picked: File | undefined) => {
    if (!picked) return;
    setError(null);

    if (!/\.(jpe?g|png|webp)$/i.test(picked.name)) {
      setError("Use a JPG, PNG or WebP image.");
      return;
    }
    if (picked.size > MAX_SOURCE_BYTES) {
      setError("That image is very large. Please use one under 15MB.");
      return;
    }

    setWorking(true);
    try {
      const square = await toSquareJpeg(picked);
      onPick(square);
      onRemove(false);
    } catch {
      setError("That image could not be read. Try a different one.");
    }
    setWorking(false);
  };

  const shown = preview || (removed ? null : currentUrl);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Photo</label>
      <div className="flex items-center gap-4">
        <PersonPhoto name={name} photoUrl={shown} size="lg" />
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={working}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {working ? "Reading..." : shown ? "Change photo" : "Upload photo"}
            </button>
            {shown && (
              <button
                type="button"
                onClick={() => {
                  onPick(null);
                  onRemove(true);
                  setError(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-risk-high hover:bg-red-50 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400">
            JPG, PNG or WebP. Cropped to a square and saved at 512px.
          </p>
        </div>
      </div>
      {error && <p className="text-xs text-risk-high mt-2">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
