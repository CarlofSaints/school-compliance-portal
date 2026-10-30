"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";

// Shared by the training pages.

export interface Step {
  icon: string;
  kind: "material" | "test";
  id: string;
  title: string;
  status: string;
  done: boolean;
  locked: boolean;
}
export interface ModuleRow {
  id: string;
  title: string;
  description: string;
  topic: string;
  status: string;
  sequential: boolean;
  icon: string;
  colour: string;
  items: Step[];
  doneCount: number;
}
export interface MaterialRow { id: string; title: string; description: string; status: string; done: boolean; locked: boolean }
export interface TestRow {
  id: string;
  title: string;
  description: string;
  status: string;
  questionCount: number;
  passMark: number;
  attempts: number;
  bestPct: number | null;
  done: boolean;
  locked: boolean;
}
export interface Catalogue { canManage: boolean; modules: ModuleRow[]; materials: MaterialRow[]; tests: TestRow[] }

export const stepHref = (s: { kind: string; id: string }, moduleId?: string) =>
  `/campus/${s.kind === "material" ? "material" : "tests"}/${s.id}${moduleId ? `?module=${moduleId}` : ""}`;

export function DraftPill() {
  const t = useT();
  return <span className="ml-2 inline-block bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs font-medium">{t("Draft")}</span>;
}


/**
 * Where "Next step" goes from a piece opened inside a module: the step after it,
 * or back to the Campus page when it was the last one. Fetched again after the
 * piece is opened or passed, so the next step's lock has already lifted.
 */
export function useNextStep(moduleId: string, kind: "material" | "test", id: string, refresh: unknown = null): string {
  const [href, setHref] = useState("/campus");
  useEffect(() => {
    if (!moduleId) return;
    let live = true;
    authFetch("/api/training").then(async (r) => {
      if (!r.ok || !live) return;
      const cat: Catalogue = await r.json();
      const m = cat.modules.find((x) => x.id === moduleId);
      const at = m ? m.items.findIndex((i) => i.kind === kind && i.id === id) : -1;
      const next = m && at >= 0 ? m.items[at + 1] : undefined;
      if (live) setHref(next && !next.locked ? stepHref(next, moduleId) : "/campus");
    });
    return () => {
      live = false;
    };
  }, [moduleId, kind, id, refresh]);
  return href;
}
