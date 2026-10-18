"use client";

import { useState } from "react";
import { authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import {
  canReview,
  canSendForReview,
  isReviewer,
  reviewProgress,
  type MinutesReview,
  type MinutesReviewer,
  type MinutesStatus,
} from "@/lib/minutes";

// ---------------------------------------------------------------------------
// The review round trip, from both ends.
//
// One component rather than two, because the same person is often both: the
// secretary who sends draft 2 is frequently also on the list that checks it.
// Splitting it would put two panels on the page arguing about whose turn it is.
// ---------------------------------------------------------------------------

interface Props {
  id: string;
  status: MinutesStatus;
  draftNumber: number;
  reviewers?: MinutesReviewer[];
  reviews: MinutesReview[];
  /** Whether this person may send it out. Reviewing needs no permission, only
   *  being on the list, so it is not the same test. */
  canManage: boolean;
  myEmail: string;
  onChanged: () => void;
  onToast: (message: string, type: "success" | "error") => void;
}

export default function MinutesReviewPanel({
  id,
  status,
  draftNumber,
  reviewers = [],
  reviews,
  canManage,
  myEmail,
  onChanged,
  onToast,
}: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState("");
  const [askingForChanges, setAskingForChanges] = useState(false);

  const progress = reviewProgress(reviewers, reviews, draftNumber);
  const mayReview = canReview(status) && isReviewer(reviewers, myEmail);
  // Whether I have already answered THIS draft. Answering twice is allowed,
  // people change their minds, but the panel should not pretend I have not
  // responded at all.
  const mine = reviews
    .filter((r) => r.draftNumber === draftNumber)
    .filter((r) => (r.byEmail || "").trim().toLowerCase() === myEmail.trim().toLowerCase())
    .slice(-1)[0];

  async function send() {
    setBusy(true);
    try {
      const res = await authFetch(`/api/minutes/${id}/send-for-review`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(data.error || t("Could not send the minutes for checking."), "error");
        return;
      }
      const parts = [
        data.sent === 1
          ? t("Sent to {n} person.", { n: data.sent })
          : t("Sent to {n} people.", { n: data.sent }),
      ];
      // Named, not swallowed. A secretary who thinks everybody was asked will
      // wait for a response that is never coming.
      if (data.failed?.length) parts.push(t("Could not reach {names}.", { names: data.failed.join(", ") }));
      if (data.withoutEmail?.length)
        parts.push(t("No email address for {names}.", { names: data.withoutEmail.join(", ") }));
      onToast(
        parts.join(" "),
        data.failed?.length || data.withoutEmail?.length ? "error" : "success"
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function respond(decision: "approved" | "changes_requested") {
    setBusy(true);
    try {
      const res = await authFetch(`/api/minutes/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comments }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(data.error || t("Could not record your response."), "error");
        return;
      }
      onToast(
        decision === "approved"
          ? data.progress?.complete
            ? t("Approved. Everyone has now checked it, so it has gone out for signing.")
            : t("Approved. Still waiting on the others.")
          : t("Sent back to the secretary with your notes."),
        "success"
      );
      setComments("");
      setAskingForChanges(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!canSendForReview(status) && !canReview(status)) return null;

  return (
    <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-sm font-semibold text-dark mb-1">{t("Checking")}</h2>

      {canSendForReview(status) && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            {status === "changes_requested"
              ? t("Somebody asked for changes. Once you have made them, send it out again as the next draft.")
              : t("Send this to the people who check minutes. They can approve it, or send it back with a note.")}
          </p>
          {canManage && (
            <button
              onClick={send}
              disabled={busy}
              className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              {busy ? t("Sending...") : t("Send draft {n} for checking", { n: draftNumber + 1 })}
            </button>
          )}
        </>
      )}

      {canReview(status) && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            {progress.waitingOn.length > 0
              ? t("Draft {draft} is out for checking. {approved} of {total} approved, waiting on {names}.", {
                  draft: draftNumber,
                  approved: progress.approved,
                  total: progress.total,
                  names: progress.waitingOn.join(", "),
                })
              : t("Draft {draft} is out for checking. {approved} of {total} approved.", {
                  draft: draftNumber,
                  approved: progress.approved,
                  total: progress.total,
                })}
          </p>

          {mayReview ? (
            <div className="rounded-lg border border-gray-200 p-4">
              {mine && (
                <p className="text-xs text-gray-500 mb-3">
                  {mine.decision === "approved"
                    ? t("You approved this draft on {date}. You can change your mind below.", {
                        date: new Date(mine.at).toLocaleDateString("en-ZA"),
                      })
                    : t("You asked for changes to this draft on {date}. You can change your mind below.", {
                        date: new Date(mine.at).toLocaleDateString("en-ZA"),
                      })}
                </p>
              )}
              {askingForChanges ? (
                <>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("What needs changing?")}
                  </label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={4}
                    autoFocus
                    placeholder={t("The finance figure in section 4 should be R52,000.")}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition text-sm"
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => respond("changes_requested")}
                      disabled={busy || !comments.trim()}
                      className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                    >
                      {busy ? t("Sending...") : t("Send it back")}
                    </button>
                    <button
                      onClick={() => setAskingForChanges(false)}
                      className="px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
                    >
                      {t("Cancel")}
                    </button>
                  </div>
                  {!comments.trim() && (
                    <p className="text-xs text-gray-400 mt-2">
                      {t("A note is required. Without one the secretary is told only that somebody is unhappy.")}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => respond("approved")}
                    disabled={busy}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                  >
                    {busy ? t("Saving...") : t("Approve this draft")}
                  </button>
                  <button
                    onClick={() => setAskingForChanges(true)}
                    disabled={busy}
                    className="px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
                  >
                    {t("Ask for changes")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              {t("You were not asked to check these minutes, so there is nothing for you to respond to.")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
