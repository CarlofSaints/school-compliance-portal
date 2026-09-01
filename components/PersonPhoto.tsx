"use client";

import { useState, useEffect } from "react";

interface PersonPhotoProps {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = {
  sm: { box: "w-9 h-9", text: "text-xs" },
  md: { box: "w-12 h-12", text: "text-sm" },
  lg: { box: "w-20 h-20", text: "text-xl" },
  xl: { box: "w-28 h-28", text: "text-3xl" },
};

// A fixed palette rather than a random colour, so the same person keeps the
// same tile everywhere in the portal and across reloads.
const TONES = [
  "bg-teal-100 text-teal-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
];

function toneFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return TONES[hash % TONES.length];
}

// First letter of the first and last word. "Dee Schoultz" reads DS; a single
// name reads one letter rather than a doubled one.
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PersonPhoto({
  name,
  photoUrl,
  size = "md",
  className = "",
}: PersonPhotoProps) {
  // A record can point at a photo whose file is missing from storage. Falling
  // back to initials keeps that a slightly plain card rather than a broken
  // image icon in the middle of the directory.
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);

  const { box, text } = SIZES[size];
  const shared = `${box} rounded-full shrink-0 object-cover ${className}`;

  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name || "Photo"}
        className={`${shared} bg-gray-100`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${shared} ${toneFor(name || "?")} flex items-center justify-center font-semibold ${text} select-none`}
      aria-label={name || "No name"}
      title={name || undefined}
    >
      {initialsOf(name)}
    </div>
  );
}
