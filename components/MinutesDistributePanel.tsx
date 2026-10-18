"use client";

import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/useAuth";
import type { MinutesDistributionNote } from "@/lib/minutes";
import type { T } from "@/lib/i18n/translate";
import { useT } from "@/components/I18nProvider";

// ---------------------------------------------------------------------------
// Sending the signed minutes to the whole governing body.
//
// The last signature already does this by itself. This panel exists because
// that is not the only way minutes get signed:
//
//   🔴 A school that signs on PAPER closes its minutes by uploading the scan,
//      which never passes through the signing route. Before this, those minutes
//      were distributed to nobody at all and nothing on the page said so.
//
// It also shows what has ALREADY gone out, which is the other half: a button
// that might be a duplicate send is a button a secretary will not press.
// ---------------------------------------------------------------------------

interface Recipient {
  email: string;
  name: string;
}

interface Preview {
  audienceLabel: string;
  to: Recipient[];
  cc: Recipient[];
  withoutEmail: string[];
  /** On the list, but outside who may read this kind of minutes. */
  heldBack?: string[];
  empty: boolean;
  closed: boolean;
}

interface Props {
  id: string;
  /** Every send so far. Absent and empty mean the same thing here, but the
   *  panel says "not sent yet" out loud rather than showing nothing. */
  distributions?: MinutesDistributionNote[];
  canManage: boolean;
  onChanged: () => void;
  onToast: (message: string, type: "success" | "error") => void;
  /** Saves any unsaved typing first. Without it, sending used the last SAVED
   *  copy and the reload afterwards wiped what was on screen (Carl lost a
   *  whole set of minutes this way). False means do not send. */
  ensureSaved?: () => Promise<boolean>;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Kevin James, Thandi Mokoena and 4 others" - the first few by name, because
 *  a count alone does not let anybody check the list is right. */
function nameList(people: Recipient[], t: T, show = 4): string {
  const names = people.map((p) => p.name || p.email);
  if (names.length <= show) {
    if (names.length <= 1) return names[0] ?? "";
    return t("{list} and {last}", { list: names.slice(0, -1).join(", "), last: names[names.length - 1] });
  }
  const rest = names.length - show;
  const list = names.slice(0, show).join(", ");
  return rest === 1
    ? t("{list} and {n} other", { list, n: rest })
    : t("{list} and {n} others", { list, n: rest });
}

export default function MinutesDistributePanel({
  id,
  distributions,
  canManage,
  onChanged,
  onToast,
  ensureSaved,
}: Props) {
  const t = useT();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    const res = await authFetch(`/api/minutes/${id}/distribute`);
    if (res.ok) setPreview(await res.json());
  }, [id]);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  async function send() {
    if (ensureSaved && !(await ensureSaved())) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/minutes/${id}/distribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(data.error || t("Those minutes could not be sent."), "error");
        return;
      }
      const parts = [
        data.sent === 1
          ? t("Sent to {n} person.", { n: data.sent })
          : t("Sent to {n} people.", { n: data.sent }),
      ];
      // Named, not counted. "3 failed" leaves a secretary with no idea who to
      // chase, which is the only useful thing to do about it.
      if (data.failed?.length) {
        parts.push(t("Could not reach {names}.", { names: data.failed.join(", ") }));
      }
      if (data.withoutEmail?.length) {
        parts.push(t("No email address for {names}.", { names: data.withoutEmail.join(", ") }));
      }
      onToast(
        parts.join(" "),
        data.failed?.length || data.withoutEmail?.length ? "error" : "success"
      );
      setConfirming(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  // Not a manager, or the minutes are not closed yet: signing has its own
  // panel and this one would only be noise.
  if (!canManage || !preview?.closed) return null;

  const sends = distributions ?? [];
  const last = sends[sends.length - 1];
  const total = preview.to.length + preview.cc.length;
  const count =
    total === 1 ? t("{total} person", { total }) : t("{total} people", { total });

  return (
    <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-sm font-semibold text-dark mb-1">
        {t("Send to the governing body")}
      </h2>

      {preview.empty ? (
        /* 🔴 Names the setting to fix rather than showing a button that
           silently reaches nobody - the same rule the review round and
           signing follow. */
        <p className="text-sm text-gray-500">
          {t("Nobody is set up to receive {audience}. Set that tag under", {
            audience: t(preview.audienceLabel).toLowerCase(),
          })}{" "}
          <span className="font-medium">{t("Admin, Minutes Admin")}</span>
          {t(", and this becomes available.")}
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-1">
            {preview.cc.length > 0
              ? t("{audience}: {count} — {names}, copying {cc}.", {
                  audience: t(preview.audienceLabel),
                  count,
                  names: nameList(preview.to, t),
                  cc: nameList(preview.cc, t, 2),
                })
              : t("{audience}: {count} — {names}.", {
                  audience: t(preview.audienceLabel),
                  count,
                  names: nameList(preview.to, t),
                })}
          </p>

          {/* Shown, never ignored. Somebody on the list with no address is a
              gap the secretary has to be able to see. */}
          {(preview.heldBack?.length ?? 0) > 0 && (
            <p className="text-sm text-amber-700 mb-1">
              {t("Not sent to {names}: they are on the list but not allowed to read these minutes (Admin, Minutes Admin, Who can read minutes).", { names: preview.heldBack!.join(", ") })}
            </p>
          )}

          {preview.withoutEmail.length > 0 && (
            <p className="text-sm text-amber-700 mb-1">
              {t("No email address for {names}, so they will not receive it.", { names: preview.withoutEmail.join(", ") })}
            </p>
          )}

          <p className="text-xs text-gray-400 mb-4">
            {last ? (
              <>
                {last.by
                  ? t("Last sent {when} by {by} — {sent} of {total} delivered", {
                      when: when(last.at),
                      by: last.by,
                      sent: last.sent,
                      total: last.recipients,
                    })
                  : t("Last sent {when} automatically, on the final signature — {sent} of {total} delivered", {
                      when: when(last.at),
                      sent: last.sent,
                      total: last.recipients,
                    })}
                {last.failed.length > 0 && t(", failed for {names}", { names: last.failed.join(", ") })}.
                {(last.heldBack?.length ?? 0) > 0 && (
                  <>
                    {" "}
                    {t("Not sent to {names}: outside who may read these minutes.", { names: last.heldBack!.join(", ") })}
                  </>
                )}
                {sends.length > 1 && (
                  <>
                    {" "}
                    {t("Sent {n} times in all.", { n: sends.length })}
                  </>
                )}
              </>
            ) : (
              /* 🔴 Absence is a value. A blank here would read as a panel that
                 had not loaded, and "not sent yet" is the whole reason to
                 look at this panel. */
              <>{t("These minutes have not been sent to the governing body yet.")}</>
            )}
          </p>

          {confirming ? (
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-dark mb-3">
                {last
                  ? t("Email the signed minutes to {count} again?", { count })
                  : t("Email the signed minutes to {count}?", { count })}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={send}
                  disabled={busy}
                  className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {busy ? t("Sending...") : t("Yes, send them")}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
                >
                  {t("Cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              {last ? t("Send again") : t("Send to the governing body")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
