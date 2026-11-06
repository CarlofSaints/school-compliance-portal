"use client";

import { useT } from "@/components/I18nProvider";

/** The role dropdown above a list. Hidden when there is only one role to choose. */
export default function RoleFilter({ names, value, onChange }: { names: string[]; value: string; onChange: (role: string) => void }) {
  const t = useT();
  if (names.length < 2) return null;
  return (
    <div className="mb-4">
      <select aria-label={t("Filter by role")} value={value} onChange={(e) => onChange(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
        <option value="">{t("All roles")}</option>
        {names.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    </div>
  );
}
