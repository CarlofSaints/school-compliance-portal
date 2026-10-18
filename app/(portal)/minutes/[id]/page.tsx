"use client";

import TranslateContentButton from "@/components/TranslateContentButton";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, authFetch } from "@/lib/useAuth";
import Toast from "@/components/Toast";
import PeriodPicker from "@/components/PeriodPicker";
import MinutesSectionEditor from "@/components/MinutesSectionEditor";
import { quickActionTitle } from "@/lib/minutesCapture";
import { mergeUnsaved } from "@/lib/minutesAutosave";
import DownloadLink from "@/components/DownloadLink";
import MinutesReviewPanel from "@/components/MinutesReviewPanel";
import MinutesSigningPanel from "@/components/MinutesSigningPanel";
import MinutesDistributePanel from "@/components/MinutesDistributePanel";
import MinutesActionsPanel from "@/components/MinutesActionsPanel";
import DangerConfirmModal from "@/components/DangerConfirmModal";
import { useT } from "@/components/I18nProvider";
import {
  formatPeriod,
  isLocked,
  MEETING_BODY_LABELS,
  MINUTES_STATUS_LABELS,
  type MeetingBody,
  type MeetingPeriod,
  type MinutesDistributionNote,
  type MinutesReview,
  type MinutesReviewer,
  type MinutesSection,
  type MinutesStatus,
  type Signatory,
} from "@/lib/minutes";

interface MinutesDetail {
  id: string;
  title: string;
  body: MeetingBody;
  period: MeetingPeriod;
  status: MinutesStatus;
  sections: MinutesSection[];
  original?: { filename: string; size: number; uploadedAt: string };
  signatories: Signatory[];
  /** The document as it stands now, computed server side so the page and the
   *  signature cannot disagree about what was signed. */
  signedCopy?: { filename: string; uploadedAt: string };
  documentHash?: string;
  documentRef?: string;
  reviewers?: MinutesReviewer[];
  reviews: MinutesReview[];
  draftNumber: number;
  distributions?: MinutesDistributionNote[];
  createdAt: string;
  createdBy: string;
  signedAt?: string;
}

// Autosave retries after a failure: further apart each time, then every 30s.
const RETRY_MS = [5000, 15000, 30000];

export default function MinutesDetailPage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session, loading } = useAuth();
  const canManage =
    !!session &&
    (session.permissions.includes("manage_minutes") ||
      session.permissions.includes("manage_users"));
  // 🔴 A DIFFERENT permission from managing minutes, and gated ANY-of the same
  // way the register's own API is. Raising an action writes to the action
  // register, not to the minutes, so it has to be gated on what it actually
  // writes to - a secretary who may edit minutes is not automatically somebody
  // who may add to the register, and vice versa.
  const canRaiseActions =
    !!session &&
    (session.permissions.includes("manage_action_items") ||
      session.permissions.includes("manage_people"));

  const [record, setRecord] = useState<MinutesDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [actionsRefresh, setActionsRefresh] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Consecutive failed saves: drives the retry backoff and the "Not saved"
  // note, so a failing autosave never turns into a stream of toasts.
  const [saveFailures, setSaveFailures] = useState(0);
  // Bumped when any save finishes, so the autosave timer re-arms even when
  // nothing else on the page changed.
  const [saveTick, setSaveTick] = useState(0);

  // ONE rule for who may change what, used by the autosave and the page alike.
  const locked = !!record && isLocked(record.status);
  const editable = canManage && !!record && !locked;
  // Out for signing: the text people are signing must not move under them.
  // The Danger zone (delete) stays, as the way out if something is wrong.
  const signingOpen = record?.status === "awaiting_signatures";
  const textEditable = editable && !signingOpen;

  // The record as it is right now, for callbacks that outlive a render (a
  // reload, the unmount save). Written wherever the record is set.
  const recordRef = useRef<MinutesDetail | null>(null);
  const put = (r: MinutesDetail) => {
    recordRef.current = r;
    setRecord(r);
  };
  // Bumped on every edit. savedVersion is the edit the server last accepted,
  // so "unsaved" is simply the two differing, whatever order saves and
  // reloads finish in.
  const editVersion = useRef(0);
  const savedVersion = useRef(0);
  const hasUnsaved = () => editVersion.current !== savedVersion.current;
  const inFlight = useRef<Promise<boolean> | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await authFetch(`/api/minutes/${params.id}`);
      if (res.ok) {
        // Every panel reloads through here after it acts. Typing since the
        // last save stays on screen and stays dirty: autosave then saves it,
        // or, if the minutes are now locked, the page says it could not.
        const server: MinutesDetail = await res.json();
        const unsaved = editVersion.current !== savedVersion.current;
        const next = mergeUnsaved(server, recordRef.current, unsaved);
        recordRef.current = next;
        setRecord(next);
        setDirty(unsaved);
      } else {
        setToast({ message: t("Those minutes could not be found."), type: "error" });
      }
    } finally {
      setBusy(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  // "+ Add to action items" under a section: one click puts the point on the
  // register with just a name and the minuted wording. Who, when and how
  // urgent are added later on the Action Items page, so the minute-taker is
  // not pulled out of the meeting to fill in a form. Nobody is assigned, so
  // nobody is emailed.
  const captureAction = async (minutesId: string, sectionId: string, text: string) => {
    const res = await authFetch("/api/action-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: quickActionTitle(text),
        description: text,
        fromMinutesId: minutesId,
        fromSectionId: sectionId,
        notify: false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast({ message: data.error || t("Could not add it to the action list."), type: "error" });
      return false;
    }
    setToast({
      message: t("Added {ref} to the action list. Add who and when later in Action Items.", { ref: data.ref }),
      type: "success",
    });
    setActionsRefresh((n) => n + 1);
    return true;
  };

  // The server's refusal from the last failed save, for the toast a manual
  // Save shows. Autosave failures stay quiet.
  const lastSaveError = useRef<string | null>(null);

  /** One PATCH of the text as it is now. True when the server took it, which
   *  is not the same as clean: typing may have carried on meanwhile. */
  const sendSave = async (): Promise<boolean> => {
    const r = recordRef.current;
    if (!r) return false;
    const version = editVersion.current;
    setSaving(true);
    try {
      const res = await authFetch(`/api/minutes/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: r.title, body: r.body, period: r.period, sections: r.sections }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastSaveError.current = data.error || t("Could not save.");
        setSaveFailures((n) => n + 1);
        return false;
      }
      // What came BACK, not a re-read: a read straight after a write can serve
      // the previous copy and make a good save look like it failed. Text typed
      // while it was in flight stays and is saved next.
      savedVersion.current = version;
      const unsaved = hasUnsaved();
      put(mergeUnsaved<MinutesDetail>(data, recordRef.current, unsaved));
      setDirty(unsaved);
      lastSaveError.current = null;
      setSaveFailures(0);
      return true;
    } catch {
      lastSaveError.current = t("Could not save.");
      setSaveFailures((n) => n + 1);
      return false;
    } finally {
      setSaving(false);
      setSaveTick((n) => n + 1);
    }
  };

  /** Saves once, after any save already running (which sent an older copy).
   *  Nothing unsaved counts as success. */
  const saveOnce = async (): Promise<boolean> => {
    while (inFlight.current) await inFlight.current;
    if (!hasUnsaved()) return true;
    const p = sendSave();
    inFlight.current = p;
    try {
      return await p;
    } finally {
      inFlight.current = null;
    }
  };

  /** True only when everything on screen is saved. A few rounds, because
   *  typing can carry on while a save is in flight. */
  const saveUntilClean = async (): Promise<boolean> => {
    for (let i = 0; i < 3; i++) {
      if (!hasUnsaved()) return true;
      if (!(await saveOnce())) return false;
    }
    return !hasUnsaved();
  };

  const saveNow = async () => {
    if (await saveUntilClean()) setToast({ message: t("Saved."), type: "success" });
    else if (lastSaveError.current) setToast({ message: lastSaveError.current, type: "error" });
    // Otherwise the save worked but typing is still going on; autosave follows.
  };

  // Before anything that sends, reviews or signs: those act on the SAVED copy
  // and then reload, so unsaved typing would be sent out missing.
  const ensureSaved = async (): Promise<boolean> => {
    // Locked text can never be saved, so refusing would only trap the user
    // (no wet-ink upload, ever). The banner keeps that text on screen to copy.
    if (!textEditable) return true;
    if (await saveUntilClean()) return true;
    setToast({ message: t("Your changes could not be saved, so nothing was sent."), type: "error" });
    return false;
  };

  // Autosave a few seconds after the last keystroke. Carl typed a whole set of
  // minutes, sent it for checking without pressing Save, and lost all of it.
  // A failed save retries further apart each time, and re-arms off saveTick.
  useEffect(() => {
    if (!dirty || !textEditable) return;
    const delay = saveFailures === 0 ? 3000 : RETRY_MS[Math.min(saveFailures, RETRY_MS.length) - 1];
    const timer = setTimeout(() => {
      void saveOnce();
    }, delay);
    return () => clearTimeout(timer);
    // saveOnce is recreated every render but reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, dirty, textEditable, saveTick, saveFailures]);

  // Leaving by the sidebar or any in-app link fires no beforeunload, so send
  // what is unsaved on the way out. keepalive lets the request outlive the
  // page, but caps the body at 64KB; past that a plain request is the best
  // there is.
  useEffect(
    () => () => {
      const r = recordRef.current;
      if (!r || editVersion.current === savedVersion.current) return;
      if (isLocked(r.status) || r.status === "awaiting_signatures") return;
      const body = JSON.stringify({ title: r.title, body: r.body, period: r.period, sections: r.sections });
      void fetch(`/api/minutes/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "same-origin",
        keepalive: new TextEncoder().encode(body).length < 60_000,
      }).catch(() => {});
    },
    []
  );

  // The in-page Back link saves first, and only leaves without saving if the
  // user says so.
  const back = async (e: React.MouseEvent) => {
    if (!hasUnsaved()) return;
    e.preventDefault();
    if (
      (await saveUntilClean()) ||
      window.confirm(t("Your changes could not be saved. Leave this page anyway and lose them?"))
    ) {
      router.push("/minutes");
    }
  };

  // Closing the tab or reloading with unsaved typing asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Returns an error message to keep the dialog open, per DangerConfirmModal.
  const remove = async (typed: string) => {
    if (!record) return;
    const res = await authFetch(`/api/minutes/${record.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: typed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error || t("Could not delete.");
    savedVersion.current = editVersion.current; // gone: nothing left to save on the way out
    router.push("/minutes");
  };

  if (loading || !session) return null;
  // Only the first load: a reload after an action must not unmount the editor
  // under someone who is typing.
  if (busy && !record) return <div className="p-6 text-gray-400">{t("Loading...")}</div>;
  if (!record) return <div className="p-6 text-gray-400">{t("Not found.")}</div>;

  const patch = (u: Partial<MinutesDetail>) => {
    editVersion.current += 1;
    if (recordRef.current) put({ ...recordRef.current, ...u });
    setDirty(true);
  };

  return (
    <div className="p-6 max-w-4xl">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <Link href="/minutes" onClick={back} className="text-sm text-gray-500 hover:text-primary">
        {t("Back to all minutes")}
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark">{record.title}</h1>
          <p className="text-gray-500 mt-1">
            {t(MEETING_BODY_LABELS[record.body])} · {formatPeriod(record.period)} ·{" "}
            {t(MINUTES_STATUS_LABELS[record.status])}
            {record.draftNumber > 0 && " · " + t("Draft {n}", { n: record.draftNumber })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {textEditable && dirty && saveFailures > 0 && !saving && (
            <span className="text-sm text-risk-high">{t("Not saved, retrying...")}</span>
          )}
          <TranslateContentButton kind="minutes" id={record.id} />
          <DownloadLink
            href={`/api/minutes/${record.id}/docx`}
            filename={`${record.title}.docx`}
            className="px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
            onError={(message) => setToast({ message, type: "error" })}
          >
            {t("Download as Word")}
          </DownloadLink>
          {textEditable && (
            <button
              onClick={() => void saveNow()}
              disabled={saving || !dirty}
              className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              {saving ? t("Saving...") : dirty ? t("Save changes") : t("Saved")}
            </button>
          )}
        </div>
      </div>

      {locked && (
        <div className="mb-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {record.signedAt
            ? t("These minutes have been signed on {date}.", {
                date: new Date(record.signedAt).toLocaleDateString("en-ZA", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }),
              })
            : t("These minutes have been signed.")}{" "}
          {t("A signed record cannot be changed. If something needs correcting, record it in the next set of minutes.")}
        </div>
      )}

      {canManage && dirty && !textEditable && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-risk-high">
          {t("These minutes were locked before your latest changes were saved, so those changes could not be saved. They are still shown below: copy anything you need before you leave this page.")}
        </div>
      )}

      {record.original && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
          <span className="text-gray-500">{t("Uploaded file:")} </span>
          <DownloadLink
            href={`/api/minutes/${record.id}/file`}
            filename={record.original.filename}
            className="text-primary hover:underline font-medium"
            onError={(message) => setToast({ message, type: "error" })}
          >
            {record.original.filename}
          </DownloadLink>
          <span className="text-gray-400">
            {" "}
            ({(record.original.size / 1024).toFixed(0)}KB)
          </span>
        </div>
      )}

      {signingOpen && canManage && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t("These minutes are out for signing, so the text is locked: everyone must sign the same words. If something needs changing, delete these minutes and start them again, or record the correction in the next set.")}
        </div>
      )}

      {textEditable && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("Name")}</label>
              <input
                value={record.title}
                onChange={(e) => patch({ title: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("Meeting")}</label>
              <select
                value={record.body}
                onChange={(e) => patch({ body: e.target.value as MeetingBody })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              >
                {Object.entries(MEETING_BODY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <PeriodPicker value={record.period} onChange={(p) => patch({ period: p })} />
        </div>
      )}

      <MinutesSectionEditor
        sections={record.sections}
        editable={textEditable}
        onChange={(sections) => patch({ sections })}
        onCaptureAction={canRaiseActions ? (sectionId, text) => captureAction(record.id, sectionId, text) : undefined}
      />

      <MinutesSigningPanel
        id={record.id}
        status={record.status}
        signatories={record.signatories}
        signedCopy={record.signedCopy}
        currentHash={record.documentHash}
        currentRef={record.documentRef}
        canManage={canManage}
        myEmail={session.email}
        onChanged={load}
        onToast={(message, type) => setToast({ message, type })}
        ensureSaved={ensureSaved}
      />

      {/* 🔴 Above signing, and NOT gated on the minutes being editable.
          Actions come out of a meeting that has been held, and a signed set of
          minutes is the most authoritative statement of what was agreed - so
          raising one from signed minutes is the normal case, not an edge one. */}
      <MinutesActionsPanel
        id={record.id}
        sections={record.sections}
        canRaise={canRaiseActions}
        onToast={(message, type) => setToast({ message, type })}
        refreshKey={actionsRefresh}
      />

      <MinutesDistributePanel
        id={record.id}
        distributions={record.distributions}
        canManage={canManage}
        onChanged={load}
        onToast={(message, type) => setToast({ message, type })}
        ensureSaved={ensureSaved}
      />

      <MinutesReviewPanel
        id={record.id}
        status={record.status}
        draftNumber={record.draftNumber}
        reviewers={record.reviewers}
        reviews={record.reviews}
        canManage={canManage}
        myEmail={session.email}
        onChanged={load}
        onToast={(message, type) => setToast({ message, type })}
        ensureSaved={ensureSaved}
      />

      {record.reviews.length > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-dark mb-3">{t("Review history")}</h2>
          <ul className="space-y-3">
            {record.reviews.map((r, i) => (
              <li key={i} className="text-sm border-l-2 border-gray-200 pl-3">
                <span className="text-dark font-medium">{r.byName}</span>{" "}
                <span className="text-gray-500">
                  {r.decision === "approved"
                    ? t("approved draft {n} on {date}", { n: r.draftNumber, date: new Date(r.at).toLocaleDateString("en-ZA") })
                    : t("asked for changes to draft {n} on {date}", { n: r.draftNumber, date: new Date(r.at).toLocaleDateString("en-ZA") })}
                </span>
                {r.draftNumber < record.draftNumber && (
                  <span className="ml-2 text-xs text-gray-400">{t("(an earlier draft)")}</span>
                )}
                {r.comments && <p className="text-gray-600 mt-1">{r.comments}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Any stage short of signed, not only a draft: minutes stuck out for
          checking or half signed are exactly the ones somebody wants gone.
          Signed minutes are refused by the server as the school's record. */}
      {editable && (
        <div className="mt-8 rounded-xl border border-risk-high/30 p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-risk-high">{t("Danger zone")}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {t("Deletes these minutes, the uploaded file and any signatures collected so far. Action items raised from them stay in the action register.")}
            </p>
          </div>
          <button
            onClick={() => setConfirmingDelete(true)}
            className="bg-risk-high hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
          >
            {t("Delete minutes")}
          </button>
        </div>
      )}

      {confirmingDelete && (
        <DangerConfirmModal
          title={t("Delete minutes")}
          itemName={record.title}
          actionLabel={t("Delete minutes")}
          onClose={() => setConfirmingDelete(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
