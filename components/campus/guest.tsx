"use client";

import { useEffect, useState } from "react";

// Share-link guests: no portal session, just the link's own cookie. A plain
// fetch, never authFetch (a 401 there would send a guest to the portal sign-in).
export const guestFetch = (url: string, init?: RequestInit) => fetch(url, { ...init, credentials: "same-origin" });

export interface ShareItem {
  kind: "material" | "test";
  id: string;
  title: string;
  icon: string;
  minutes: number | null;
  done: boolean;
  locked: boolean;
}
export interface ShareView {
  school: string;
  title: string;
  description: string;
  icon: string;
  colour: string;
  items: ShareItem[];
  guest: { name: string; surname: string } | null;
}

export const guestStepHref = (token: string, s: { kind: string; id: string }) => `/s/${token}/${s.kind === "test" ? "tests" : "material"}/${s.id}`;

/** Where "Next step" goes for a guest: the next unlocked piece on the link, or the link's page. */
export function useGuestNext(token: string, kind: string, id: string, refresh: unknown): string {
  const home = `/s/${token}`;
  const [href, setHref] = useState(home);
  useEffect(() => {
    if (!refresh) return;
    guestFetch(`/api/share/${token}`).then(async (r) => {
      if (!r.ok) return;
      const v: ShareView = await r.json();
      const at = v.items.findIndex((i) => i.kind === kind && i.id === id);
      const next = at >= 0 ? v.items[at + 1] : undefined;
      setHref(next && !next.locked ? guestStepHref(token, next) : home);
    });
  }, [token, kind, id, refresh, home]);
  return href;
}

export function GuestShell({ school, children }: { school?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <p className="font-semibold text-dark">{school ? `${school} Campus` : "Campus"}</p>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
