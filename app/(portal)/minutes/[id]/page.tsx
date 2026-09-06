"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, authFetch } from "@/lib/useAuth";
import Toast from "@/components/Toast";
import PeriodPicker from "@/components/PeriodPicker";
import MinutesSectionEditor from "@/components/MinutesSectionEditor";
import {
  formatPeriod,
  isLocked,
  MEETING_BODY_LABELS,
  MINUTES_STATUS_LABELS,
  type MeetingBody,
  type MeetingPeriod,
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
  reviews: { at: string; byName: string; decision: string; comments?: string }[];
  draftNumber: number;
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

  const [record, setRecord] = useState<MinutesDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

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

  const remove = async () => {
    if (!record) return;
    const res = await authFetch(`/api/minutes/${record.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast({ message: data.error || "Could not delete.", type: "error" });
      return;
    }
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
          <a
            href={`/api/minutes/${record.id}/docx`}
            className="px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
          >
            Download as Word
          </a>
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
          <a
            href={`/api/minutes/${record.id}/file`}
            className="text-primary hover:underline font-medium"
          >
            {record.original.filename}
          </a>
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

      {record.reviews.length > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-dark mb-3">Review history</h2>
          <ul className="space-y-3">
            {record.reviews.map((r, i) => (
              <li key={i} className="text-sm border-l-2 border-gray-200 pl-3">
                <span className="text-dark font-medium">{r.byName}</span>{" "}
                <span className="text-gray-500">
                  {r.decision === "approved" ? "approved" : "asked for changes"} on{" "}
                  {new Date(r.at).toLocaleDateString("en-ZA")}
                </span>
                {r.comments && <p className="text-gray-600 mt-1">{r.comments}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {editable && record.status === "draft" && (
        <div className="mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={remove}
            className="text-sm text-risk-high hover:underline"
          >
            Delete this draft
          </button>
        </div>
      )}
    </div>
  );
}
