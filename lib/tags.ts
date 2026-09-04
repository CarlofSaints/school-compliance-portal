// PURE tag types and constants — no storage, no @vercel/blob, no next/headers.
//
// Same split as lib/actionItems.ts vs lib/actionItemData.ts, and for the same
// reason: five "use client" pages want nothing from tags but the colour
// classes, and importing those from the blob-backed module drags the storage
// layer (and everything it imports) into the BROWSER bundle.
//
// That was already shipping the blob SDK to the client. It only became a build
// failure once the data layer started resolving the tenant from the request,
// because next/headers cannot exist in a browser bundle at all.
//
// lib/tagData.ts re-exports all of this, so server-side imports are unchanged.

export interface Tag {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
}

export const TAG_COLORS = [
  "slate",
  "blue",
  "emerald",
  "amber",
  "purple",
  "rose",
] as const;

// Tailwind classes per colour. Written out in full because Tailwind only keeps
// class names it can see in the source - a template string would be purged.
export const TAG_COLOR_CLASSES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-blue-100 text-blue-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700",
  rose: "bg-rose-100 text-rose-700",
};
