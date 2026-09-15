"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, authFetch } from "@/lib/useAuth";
import Toast from "@/components/Toast";
import PeriodPicker from "@/components/PeriodPicker";
import MinutesSectionEditor from "@/components/MinutesSectionEditor";
import DownloadLink from "@/components/DownloadLink";
import MinutesReviewPanel from "@/components/MinutesReviewPanel";
import MinutesSigningPanel from "@/components/MinutesSigningPanel";
import MinutesDistributePanel from "@/components/MinutesDistributePanel";
import MinutesActionsPanel from "@/components/MinutesActionsPanel";
import DangerConfirmModal from "@/components/DangerConfirmModal";
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

export default function MinutesDetailPage() {
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await authFetch(`/api/minutes/${params.id}`);
      if (res.ok) {
        setRecord(await res.json());
        setDirty(false);
      } else {
        setToast({ message: "Those minutes could not be found.", type: "error" });
      }
    } finally {
      setBusy(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const save = async () => {
    if (!record) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/minutes/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: record.title,
          body: record.body,
          period: record.period,
          sections: record.sections,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ message: data.error || "Could not save.", type: "error" });
        return;
      }
      // What came BACK, not a re-read: a read straight after a write can serve
      // the previous copy and make a good save look like it failed.
      setRecord(data);
      setDirty(false);
      setToast({ message: "Saved.", type: "success" });
    } catch {
      setToast({ message: "Could not save.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // Returns an error message to keep the dialog open, per DangerConfirmModal.
  const remove = async (typed: string) => {
    if (!record) return;
    const res = await authFetch(`/api/minutes/${record.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: typed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error || "Could not delete.";
    router.push("/minutes");
  };

  if (loading || !session) return null;
  if (busy) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!record) return <div className="p-6 text-gray-400">Not found.</div>;

  const locked = isLocked(record.status);
  const editable = canManage && !locked;

  const patch = (u: Partial<MinutesDetail>) => {
    setRecord((r) => (r ? { ...r, ...u } : r));
    setDirty(true);
  };

  return (
    <div className="p-6 max-w-4xl">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <Link href="/minutes" className="text-sm text-gray-500 hover:text-primary">
        Back to all minutes
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark">{record.title}</h1>
          <p className="text-gray-500 mt-1">
            {MEETING_BODY_LABELS[record.body]} · {formatPeriod(record.period)} ·{" "}
            {MINUTES_STATUS_LABELS[record.status]}
            {record.draftNumber > 0 && ` · Draft ${record.draftNumber}`}
          </p>
        </div>
        <div className="flex gap-2">
          <DownloadLink
            href={`/api/minutes/${record.id}/docx`}
            filename={`${record.title}.docx`}
            className="px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
            onError={(message) => setToast({ message, type: "error" })}
          >
            Download as Word
          </DownloadLink>
          {editable && (
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
            </button>
          )}
        </div>
      </div>

      {locked && (
        <div className="mb-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          These minutes have been signed
          {record.signedAt &&
            ` on ${new Date(record.signedAt).toLocaleDateString("en-ZA", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}`}
          . A signed record cannot be changed. If something needs correcting,
          record it in the next set of minutes.
        </div>
      )}

      {record.original && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
          <span className="text-gray-500">Uploaded file: </span>
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

      {editable && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                value={record.title}
                onChange={(e) => patch({ title: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meeting</label>
              <select
                value={record.body}
                onChange={(e) => patch({ body: e.target.value as MeetingBody })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              >
                {Object.entries(MEETING_BODY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
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
        editable={editable}
        onChange={(sections) => patch({ sections })}
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
      />

      <MinutesDistributePanel
        id={record.id}
        distributions={record.distributions}
        canManage={canManage}
        onChanged={load}
        onToast={(message, type) => setToast({ message, type })}
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
      />

      {record.reviews.length > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-dark mb-3">Review history</h2>
          <ul className="space-y-3">
            {record.reviews.map((r, i) => (
              <li key={i} className="text-sm border-l-2 border-gray-200 pl-3">
                <span className="text-dark font-medium">{r.byName}</span>{" "}
                <span className="text-gray-500">
                  {r.decision === "approved" ? "approved" : "asked for changes to"} draft{" "}
                  {r.draftNumber} on {new Date(r.at).toLocaleDateString("en-ZA")}
                </span>
                {r.draftNumber < record.draftNumber && (
                  <span className="ml-2 text-xs text-gray-400">(an earlier draft)</span>
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
            <h2 className="text-sm font-semibold text-risk-high">Danger zone</h2>
            <p className="text-sm text-gray-500 mt-1">
              Deletes these minutes, the uploaded file and any signatures
              collected so far. Action items raised from them stay in the
              action register.
            </p>
          </div>
          <button
            onClick={() => setConfirmingDelete(true)}
            className="bg-risk-high hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
          >
            Delete minutes
          </button>
        </div>
      )}

      {confirmingDelete && (
        <DangerConfirmModal
          title="Delete minutes"
          itemName={record.title}
          actionLabel="Delete minutes"
          onClose={() => setConfirmingDelete(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
