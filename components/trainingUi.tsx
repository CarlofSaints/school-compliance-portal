"use client";

import { useT } from "@/components/I18nProvider";

// Shared by the training pages.

export interface Step {
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

