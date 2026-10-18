"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import { longDateLabel, slotLabel } from "@/lib/roomBookings";

// Where the Approve / Decline links in the request email land. The link only
// opens the right form; it never answers by itself, so a mail scanner that
// follows links cannot give a room away. The person must be signed in, and the
// server only lets a holder of the booking (or a room manager) answer.

interface Detail {
  status: "pending" | "approved" | "declined" | "withdrawn";
  canAnswer: boolean;
  requesterName: string;
  requesterMeeting: string;
  message: string;
  attendeeCount: number;
  declineReason: string | null;
  roomName: string;
  date: string;
  startMinute: number;
  endMinute: number;
  yourMeeting: string;
  holderName: string;
}

export default function RoomRequestPage() {
  const t = useT();
  const { session, loading } = useAuth();
  const { token } = useParams<{ token: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<"approve" | "decline" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!session) return;
    (async () => {
      const res = await authFetch(`/api/bookings/request/${encodeURIComponent(token)}`);
      if (!res.ok) {
        setLoadError(await apiErrorMessage(res, t("That request no longer exists")));
        return;
      }
      setDetail(await res.json());
      const action = new URLSearchParams(window.location.search).get("action");
      setMode(action === "approve" || action === "decline" ? action : null);
    })();
  }, [session, token, t]);

  const answer = async () => {
    if (!mode) return;
    setBusy(true);
    setError("");
    const res = await authFetch(`/api/bookings/request/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: mode, reason }),
    });
    setBusy(false);
    if (!res.ok) return setError(await apiErrorMessage(res, t("Failed")));
    const data = await res.json().catch(() => ({}));
    if (data.emailFailed) setNote(t("Saved, but the email to them couldn't be sent. Please tell them yourself."));
    setDetail((d) => (d ? { ...d, status: data.status, declineReason: mode === "decline" ? reason : d.declineReason } : d));
  };

  if (loading || (!detail && !loadError)) return <div className="p-6">{t("Loading...")}</div>;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-dark mb-1">{t("Someone is asking for your room")}</h1>
      <p className="text-gray-500 text-sm mb-6">{t("Nothing has changed yet. The room is still yours unless you agree.")}</p>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4 text-sm">
        {loadError || !detail ? (
          <p className="text-gray-600">{loadError}</p>
        ) : (
          <>
            <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {([
                [t("Your booking"), detail.yourMeeting],
                [t("Room"), detail.roomName],
                [t("When"), `${longDateLabel(detail.date, t)}, ${slotLabel(detail.startMinute, detail.endMinute, t)}`],
                [t("They want it for"), detail.requesterMeeting],
                [t("Their attendees"), String(detail.attendeeCount)],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex gap-3 px-3 py-2">
                  <dt className="w-32 shrink-0 text-gray-500">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="mb-1 text-gray-500">{t("{name} says:", { name: detail.requesterName })}</p>
              <blockquote className="rounded-lg border-l-4 border-primary bg-gray-50 px-3 py-2">{detail.message}</blockquote>
            </div>

            {detail.status !== "pending" ? (
              <div className="rounded-lg bg-gray-50 px-3 py-3">
                {detail.status === "approved" && <p>{t("{name} has the room. It is booked in their name and they have been emailed.", { name: detail.requesterName })}</p>}
                {detail.status === "declined" && (
                  <p>
                    {t("The room was kept and {name} has been told why.", { name: detail.requesterName })}
                    {detail.declineReason ? ` ${t("The reason given: \"{reason}\"", { reason: detail.declineReason })}` : ""}
                  </p>
                )}
                {detail.status === "withdrawn" && <p>{t("This request is no longer needed: the booking was cancelled, moved, or handed to someone else.")}</p>}
                {note && <p className="mt-2 text-amber-800">{note}</p>}
              </div>
            ) : !detail.canAnswer ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                {t("Only {holder}, who holds the room, can answer this.", { holder: detail.holderName })}
              </p>
            ) : mode === null ? (
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => setMode("decline")} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">{t("Decline")}</button>
                <button onClick={() => setMode("approve")} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium">{t("Let them have it")}</button>
              </div>
            ) : (
              <div className="space-y-3">
                {mode === "approve" ? (
                  <p className="rounded-lg bg-gray-50 px-3 py-2">
                    {t("The slot passes straight to {name}: it becomes their meeting, in the same room at the same time, and your booking goes. They will be emailed.", { name: detail.requesterName })}
                  </p>
                ) : (
                  <label className="block">
                    <span className="font-medium">{t("Why are you keeping it?")}</span>
                    <textarea value={reason} maxLength={1000} rows={3} autoFocus onChange={(e) => setReason(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
                    <span className="text-xs text-gray-500">{t("They will see this word for word.")}</span>
                  </label>
                )}
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setMode(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">{t("Back")}</button>
                  <button
                    onClick={answer}
                    disabled={busy || (mode === "decline" && !reason.trim())}
                    className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {busy ? t("Saving...") : mode === "approve" ? t("Yes, give them the room") : t("Decline the request")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        <Link href="/bookings" className="inline-block text-primary hover:underline">{t("Open the room calendar")}</Link>
      </div>
    </div>
  );
}
