"use client";

import { useBranding } from "@/components/BrandingProvider";

// ---------------------------------------------------------------------------
// The school's crest, wherever it appears.
//
// Deliberately a plain <img> and NOT next/image, for three reasons that only
// showed up once schools could upload their own:
//
//  1. next/image refuses a src with a query string unless the exact pattern is
//     allow-listed in next.config. The crest URL carries ?v= so a changed crest
//     busts caches, and that failed the BUILD: "Image with src
//     /api/branding/logo?v=1 is using a query string which is not configured in
//     images.localPatterns."
//  2. next/image will not render SVG at all without dangerouslyAllowSVG, and
//     turning that on for files strangers upload is exactly as advertised.
//  3. There is nothing to optimise. It is already a small file, served from our
//     own route with an immutable cache header and a version in the URL.
//
// One component so a fourth place that needs the crest cannot reintroduce any
// of that.
// ---------------------------------------------------------------------------

export default function SchoolCrest({
  width,
  height,
  className = "",
  priority = false,
}: {
  width: number;
  height: number;
  className?: string;
  /** Hints the browser to fetch it early. Worth it above the fold on sign-in. */
  priority?: boolean;
}) {
  const branding = useBranding();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={branding.logo}
      alt={branding.logoAlt}
      width={width}
      height={height}
      // Width and height are given so the layout does not jump while it loads,
      // but object-contain keeps a crest of any shape from being stretched.
      style={{ width, height, objectFit: "contain" }}
      className={className}
      fetchPriority={priority ? "high" : undefined}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
