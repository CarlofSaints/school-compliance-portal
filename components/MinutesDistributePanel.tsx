"use client";

import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/useAuth";
import type { MinutesDistributionNote } from "@/lib/minutes";

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
function nameList(people: Recipient[], show = 4): string {
  const names = people.map((p) => p.name || p.email);
  if (names.length <= show) {
    if (names.length <= 1) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  const rest = names.length - show;
  return `${names.slice(0, show).join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`;
}

export default function MinutesDistributePanel({
  id,
  distributions,
  canManage,
  onChanged,
  onToast,
}: Props) {
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
    setBusy(true);
    try {
      const res = await authFetch(`/api/minutes/${id}/distribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(data.error || "Those minutes could not be sent.", "error");
        return;
      }
      const parts = [
        `Sent to ${data.sent} ${data.sent === 1 ? "person" : "people"}.`,
      ];
      // Named, not counted. "3 failed" leaves a secretary with no idea who to
      // chase, which is the only useful thing to do about it.
      if (data.failed?.length) {
        parts.push(`Could not reach ${data.failed.join(", ")}.`);
      }
      if (data.withoutEmail?.length) {
        parts.push(`No email address for ${data.withoutEmail.join(", ")}.`);
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

  return (
    <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-sm font-semibold text-dark mb-1">
        Send to the governing body
      </h2>

      {preview.empty ? (
        /* 🔴 Names the setting to fix rather than showing a button that
           silently reaches nobody - the same rule the review round and
           signing follow. */
        <p className="text-sm text-gray-500">
          Nobody is set up to receive {preview.audienceLabel.toLowerCase()}. Set
          that tag under <span className="font-medium">Admin, Minutes Admin</span>,
          and this becomes available.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-1">
            {preview.audienceLabel}: {total}{" "}
            {total === 1 ? "person" : "people"} — {nameList(preview.to)}
            {preview.cc.length > 0 && `, copying ${nameList(preview.cc, 2)}`}.
          </p>

          {/* Shown, never ignored. Somebody on the list with no address is a
              gap the secretary has to be able to see. */}
          {preview.withoutEmail.length > 0 && (
            <p className="text-sm text-amber-700 mb-1">
              No email address for {preview.withoutEmail.join(", ")}, so they
              will not receive it.
            </p>
          )}

          <p className="text-xs text-gray-400 mb-4">
            {last ? (
              <>
                Last sent {when(last.at)}
                {last.by ? ` by ${last.by}` : " automatically, on the final signature"}
                {" — "}
                {last.sent} of {last.recipients} delivered
                {last.failed.length > 0 && `, failed for ${last.failed.join(", ")}`}.
                {sends.length > 1 && ` Sent ${sends.length} times in all.`}
              </>
            ) : (
              /* 🔴 Absence is a value. A blank here would read as a panel that
                 had not loaded, and "not sent yet" is the whole reason to
                 look at this panel. */
              <>These minutes have not been sent to the governing body yet.</>
            )}
          </p>

          {confirming ? (
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-dark mb-3">
                Email the signed minutes to {total}{" "}
                {total === 1 ? "person" : "people"}
                {last && " again"}?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={send}
                  disabled={busy}
                  className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {busy ? "Sending..." : "Yes, send them"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              {last ? "Send again" : "Send to the governing body"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
