"use client";

import { useState } from "react";
import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";

// Report a bug or request a feature. The sidebar link adds ?from=<page> so the
// report says where the person was.
export default function FeedbackPage() {
  const t = useT();
  const { session, loading } = useAuth();
  const [kind, setKind] = useState<"" | "bug" | "feature">("");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const page = new URLSearchParams(window.location.search).get("from") || "";
      const res = await authFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, summary, detail, page }),
      });
      if (!res.ok) {
        setError(await apiErrorMessage(res, t("Your report could not be sent just now. Please try again in a moment.")));
        return;
      }
      setTicket((await res.json()).ticket);
    } catch {
      setError(t("Your report could not be sent just now. Please try again in a moment."));
    } finally {
      setSending(false);
    }
  };

  if (loading || !session) return <div className="p-6">{t("Loading...")}</div>;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">{t("Report a bug or request a feature")}</h1>
        <p className="text-gray-500 text-sm">{t("Tell us what went wrong, or what would make the portal better. We read every one.")}</p>
      </div>

      {ticket ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
          <p className="text-lg font-semibold text-dark">{t("Thank you. Your ticket number is {ticket}.", { ticket })}</p>
          <p className="text-sm text-gray-600">{t("We have emailed you a copy. Quote the ticket number if you write to us about it.")}</p>
          <button
            onClick={() => { setTicket(""); setKind(""); setSummary(""); setDetail(""); }}
            className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
          >
            {t("Send another")}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">{t("What is it?")}</span>
            <select
              required
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">{t("Choose one")}</option>
              <option value="bug">{t("Report a bug")}</option>
              <option value="feature">{t("Request a new feature")}</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">{t("Short title")}</span>
            <input
              required
              maxLength={120}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={kind === "feature" ? t("e.g. Export the action items to Word") : t("e.g. The Save button does nothing on the minutes page")}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">{t("Details")}</span>
            <textarea
              required
              maxLength={5000}
              rows={8}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={
                kind === "feature"
                  ? t("What would you like it to do, and what would it save you?")
                  : t("What did you do, what did you expect, and what happened instead?")
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </label>
          <p className="text-xs text-gray-500">{t("Please leave out learners' names and other personal details.")}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={sending}
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {sending ? t("Sending...") : t("Submit")}
          </button>
        </form>
      )}
    </div>
  );
}
