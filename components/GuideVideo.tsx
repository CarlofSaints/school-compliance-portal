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

// Storage can be blocked (private mode): then it counts as seen, so nothing
// pops up uninvited, and the button still works.
function readSeen(id: string): boolean {
  try {
    return localStorage.getItem(seenKey(id)) === "1";
  } catch {
    return true;
  }
}
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

export default function GuideVideo() {
  const t = useT();
  const id = VIDEOS[usePathname()];
  // The server renders it closed (it has no storage), the browser then opens it
  // on a first visit to this page.
  const seen = useSyncExternalStore(subscribe, () => (id ? readSeen(id) : true), () => true);
  // What the viewer chose on THIS page; a new page starts from its own seen flag.
  const [choice, setChoice] = useState<{ id: string; open: boolean } | null>(null);

  if (!id) return null;
  const open = choice?.id === id ? choice.open : !seen;

  const close = () => {
    setChoice({ id, open: false });
    try {
      localStorage.setItem(seenKey(id), "1");
    } catch {}
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setChoice({ id, open: true })}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-dark px-4 py-2 text-sm font-semibold text-white shadow-lg hover:opacity-90"
      >
        ▶ {t("Watch how")}
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label={t("How this page works")}
      className="fixed bottom-4 right-4 z-40 w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-xl bg-black shadow-2xl"
    >
      <video
        key={id}
        src={`/tutorials/${id}.mp4`}
        className="block w-full"
        autoPlay
        muted
        playsInline
        controls
        onEnded={close}
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
