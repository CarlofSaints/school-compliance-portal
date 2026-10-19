"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import type { MinutesAudience } from "@/lib/minutes";

export interface AudienceNames {
  to: string[];
  cc: string[];
  withoutEmail: string[];
}

/** Who a minutes list reaches, by name. Shared by Minutes Admin and the
 *  minutes page, so both say the same thing. */
export function AudienceLine({ p, showCc = true }: { p: AudienceNames; showCc?: boolean }) {
  const t = useT();
  return (
    <div className="mt-3 text-xs text-gray-500 space-y-1">
      <div>
        <span className="text-gray-400">{t("Goes to:")} </span>
        {p.to.length ? p.to.join(", ") : <span className="text-amber-700">{t("nobody")}</span>}
      </div>
      {showCc && p.cc.length > 0 && (
        <div>
          <span className="text-gray-400">{t("Copied:")} </span>
          {p.cc.join(", ")}
        </div>
      )}
      {p.withoutEmail.length > 0 && (
        // Named rather than silently skipped: somebody meant to receive the
        // minutes who has no address is a gap the secretary needs to see now,
        // not at the next meeting.
        <div className="text-amber-700">
          {t("No email address on file, so will not receive it:")} {p.withoutEmail.join(", ")}
        </div>
      )}
    </div>
  );
}

/**
 * The list a Send button is about to use, shown above it. Carl: "surface on
 * the minutes who the minutes will go to". Read from the same settings the
 * send resolves, so it cannot name different people.
 */
export default function AudiencePreview({ audience, showCc = true }: { audience: MinutesAudience; showCc?: boolean }) {
  const [p, setP] = useState<AudienceNames | null>(null);
  useEffect(() => {
    let live = true;
    authFetch("/api/minutes-recipients")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d?.preview?.[audience]) setP(d.preview[audience]);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [audience]);
  if (!p) return null;
  return (
    <div className="mb-4 -mt-1">
      <AudienceLine p={p} showCc={showCc} />
    </div>
  );
}
