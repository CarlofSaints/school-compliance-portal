"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useT } from "@/components/I18nProvider";

// A 20-30 second "how this page works" clip, bottom right, like Resend's DNS
// video. Plays MUTED on the first visit to each page (the captions carry it;
// the sound is Carl's voice for anyone who unmutes), then a small "Watch how"
// button brings it back.
//
// The clips are filmed on the DEMO school (invented people, `.example` emails)
// and built in the school-compliance-video repo: src/tutorials.ts. A page not in
// this list simply shows nothing.
export const VIDEOS: Record<string, string> = {
  "/dashboard": "dashboard",
  "/people": "people",
  "/action-items": "action-items",
  "/minutes": "minutes",
  "/guide": "guide",
  "/policies": "policies",
  "/compliance": "compliance",
  "/compliance/guidelines": "guidelines",
  "/documents": "documents",
  "/spend": "spend",
  "/spend/reports": "spend-reports",
  "/bookings": "bookings",
  "/rooms": "rooms",
  "/activity": "activity",
  "/admin/users": "users",
  "/admin/roles": "roles",
  "/admin/people": "people-positions",
  "/admin/positions": "people-types",
  "/admin/tags": "tags",
  "/admin/policy-categories": "policy-categories",
  "/admin/action-categories": "action-categories",
  "/admin/approval-settings": "approval-settings",
  "/admin/spend-settings": "spend-settings",
  "/admin/minutes": "minutes-admin",
  "/admin/branding": "branding",
  "/admin/weekly-update": "weekly-update",
  "/admin/translation-credits": "translation-credits",
  "/admin/action-summary": "action-summary",
  "/admin/sent-emails": "sent-emails",
  "/admin/backup": "backup",
};

const seenKey = (id: string) => `guide-video-seen:${id}`;

function markSeen(id: string) {
  try {
    localStorage.setItem(seenKey(id), "1");
  } catch {}
}

// Opens by itself only on a first visit, on a screen wide enough not to cover
// the page, and not for someone who asked for less motion. Blocked storage
// counts as seen, so nothing pops up uninvited; the button always works.
function shouldAutoOpen(id: string): boolean {
  try {
    if (localStorage.getItem(seenKey(id)) === "1") return false;
    return matchMedia("(min-width: 768px)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
// Read once per page; nothing outside this tab should open or close it.
const subscribe = () => () => {};

export default function GuideVideo() {
  const id = VIDEOS[usePathname()];
  // Keyed on the page, so what the viewer chose on one page never carries to the next.
  return id ? <PageVideo key={id} id={id} /> : null;
}

function PageVideo({ id }: { id: string }) {
  const t = useT();
  // The server renders it closed (it has no storage); the browser decides.
  const auto = useSyncExternalStore(subscribe, () => shouldAutoOpen(id), () => false);
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? auto;
  const close = () => {
    setChoice(false);
    markSeen(id);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setChoice(true)}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-dark px-4 py-2 text-sm font-semibold text-white shadow-lg hover:opacity-90"
      >
        ▶ {t("Watch how")}
      </button>
    );
  }

  return (
    <div
      role="complementary"
      aria-label={t("How this page works")}
      onKeyDown={(e) => e.key === "Escape" && close()}
      className="fixed bottom-4 right-4 z-40 w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-xl bg-black shadow-2xl"
    >
      <video
        src={`/tutorials/${id}.mp4`}
        className="block w-full"
        autoPlay
        muted
        playsInline
        controls
        // Seen as soon as it plays: leaving the page mid-clip must not bring it back.
        onPlay={() => markSeen(id)}
        onEnded={close}
        // A clip that cannot load must not leave a black box in the corner.
        onError={close}
      />
      <button
        type="button"
        onClick={close}
        aria-label={t("Close")}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
      >
        ×
      </button>
    </div>
  );
}
