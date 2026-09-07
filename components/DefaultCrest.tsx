import React from "react";

// ---------------------------------------------------------------------------
// The mark shown for a school that has not uploaded its own crest yet.
//
// 🔴 It exists because the previous answer was Hurlyvale's crest. The generic
// branding fallback pointed at /public/logo.png, which is HVPS's actual badge,
// so every school on the shared deployment wore it until it uploaded one of
// its own - on its sign-in page and in the header of every email it sent.
//
// DRAWN rather than a file, so it cannot be confused with a school's asset,
// needs no upload step during provisioning, and scales without a second copy
// at another size. It is the School Compliance fleur-de-lis: the product's own
// mark is the honest thing to show while a school has none of its own, and it
// reads as deliberate rather than as a missing image.
// ---------------------------------------------------------------------------

export default function DefaultCrest({
  width,
  height,
  className = "",
  /** Inherits the school's own colour where it is on a light ground. */
  color = "currentColor",
}: {
  width: number;
  height: number;
  className?: string;
  color?: string;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      className={className}
      style={{ width, height, objectFit: "contain", color }}
      role="img"
      aria-label="No school crest uploaded yet"
    >
      <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeWidth="3" />
      <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="2" />
      <path
        d="M50 24 C44 34 44 44 50 52 C56 44 56 34 50 24 Z"
        fill="none"
        stroke={color}
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path
        d="M50 52 C42 50 34 46 33 39 C32 33 38 31 41 35 C43 38 42 45 50 52 Z"
        fill="none"
        stroke={color}
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path
        d="M50 52 C58 50 66 46 67 39 C68 33 62 31 59 35 C57 38 58 45 50 52 Z"
        fill="none"
        stroke={color}
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path d="M38 56 H62" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M50 52 V72" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
      <path
        d="M44 72 C46 68 54 68 56 72"
        fill="none"
        stroke={color}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
