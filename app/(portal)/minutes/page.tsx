"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useAuth, authFetch } from "@/lib/useAuth";
import Toast from "@/components/Toast";
import PeriodPicker from "@/components/PeriodPicker";
import {
  formatPeriod,
  periodSortKey,
  MEETING_BODY_LABELS,
  MINUTES_STATUS_LABELS,
  type MeetingBody,
  type MeetingPeriod,
  type MinutesStatus,
} from "@/lib/minutes";

interface MinutesRow {
  id: string;
  title: string;
  body: MeetingBody;
  period: MeetingPeriod;
  status: MinutesStatus;
  original?: { filename: string; size: number };
  sections: unknown[];
  createdAt: string;
  createdBy: string;
  signedAt?: string;
}

const STATUS_TONE: Record<MinutesStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  in_review: "bg-blue-50 text-blue-700",
  changes_requested: "bg-amber-50 text-amber-800",
  awaiting_signatures: "bg-purple-50 text-purple-700",
  signed: "bg-emerald-50 text-emerald-700",
  archived: "bg-gray-100 text-gray-400",
};

export default function MinutesPage() {
  const { session, loading } = useAuth();
  const canManage =
    !!session &&
    (session.permissions.includes("manage_minutes") ||
      session.permissions.includes("manage_users"));

  const [rows, setRows] = useState<MinutesRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await authFetch("/api/minutes");
      if (res.ok) setRows(await res.json());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  if (loading || !session) return null;

  const sorted = [...rows].sort((a, b) =>
    periodSortKey(b.period).localeCompare(periodSortKey(a.period))
  );

  return (
    <div className="p-6">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark">Meeting minutes</h1>
          <p className="text-gray-500 mt-1">
            Every set of SGB and FINCOM minutes in one place. Upload what you
            already have, or write them here.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setAdding(true)}
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Add minutes
          </button>
        )}
      </div>

      {adding && (
        <AddMinutes
          onClose={() => setAdding(false)}
          onSaved={(msg) => {
            setAdding(false);
            setToast({ message: msg, type: "success" });
            load();
          }}
          onError={(msg) => setToast({ message: msg, type: "error" })}
        />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Minutes</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-32">Meeting</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-44">Period</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-44">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-40">Added</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 w-48">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/minutes/${m.id}`}
                    className="text-primary font-medium hover:underline"
                  >
                    {m.title}
                  </Link>
                  <div className="text-xs text-gray-400">
                    {m.original
                      ? m.original.filename
                      : `${m.sections.length} section${m.sections.length === 1 ? "" : "s"}`}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {MEETING_BODY_LABELS[m.body]}
                </td>
                <td className="px-4 py-3 text-gray-600">{formatPeriod(m.period)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded ${STATUS_TONE[m.status]}`}>
                    {MINUTES_STATUS_LABELS[m.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(m.createdAt).toLocaleDateString("en-ZA", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                  <div className="text-gray-400">{m.createdBy}</div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link
                    href={`/minutes/${m.id}`}
                    className="text-primary hover:text-primary-dark text-xs font-medium mr-3"
                  >
                    {canManage && m.status === "draft" ? "Open and edit" : "Open"}
                  </Link>
                  {m.original && (
                    <a
                      href={`/api/minutes/${m.id}/file`}
                      className="text-gray-500 hover:text-dark text-xs mr-3"
                      title={m.original.filename}
                    >
                      File
                    </a>
                  )}
                  <a
                    href={`/api/minutes/${m.id}/docx`}
                    className="text-gray-500 hover:text-dark text-xs"
                  >
                    Word
                  </a>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && !busy && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                  No minutes yet.
                  {canManage && " Add your first set with the button above."}
                </td>
              </tr>
            )}
            {busy && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddMinutes({
  onClose,
  onSaved,
  onError,
}: {
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const now = new Date();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState<MeetingBody>("sgb");
  const [period, setPeriod] = useState<MeetingPeriod>({
    kind: "month",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [mode, setMode] = useState<"upload" | "write">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!title.trim()) return onError("Give these minutes a name.");
    if (mode === "upload" && !file) return onError("Choose a file, or switch to writing them here.");

    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("title", title.trim());
      fd.set("body", body);
      fd.set("period", JSON.stringify(period));
      if (mode === "upload" && file) fd.set("file", file);
      if (mode === "write") fd.set("startBlank", "1");

      const res = await authFetch("/api/minutes", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return onError(data.error || "Could not save those minutes.");
      onSaved(`Added "${title.trim()}".`);
    } catch {
      onError("Could not save those minutes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. SGB meeting, 7 May 2026"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Meeting</label>
          <select
            value={body}
            onChange={(e) => setBody(e.target.value as MeetingBody)}
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

      <PeriodPicker value={period} onChange={setPeriod} />

      <div>
        <div className="flex gap-2 mb-3">
          {(["upload", "write"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                mode === m
                  ? "bg-primary text-white border-primary"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {m === "upload" ? "Upload a file" : "Write them here"}
            </button>
          ))}
        </div>

        {mode === "upload" ? (
          <div>
            <input
              ref={fileInput}
              type="file"
              accept=".docx,.doc,.xlsx,.xls,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {file ? "Choose a different file" : "Browse for a file"}
            </button>
            {file && (
              <span className="ml-3 text-sm text-gray-500">
                {file.name} ({(file.size / 1024).toFixed(0)}KB)
              </span>
            )}
            <p className="text-xs text-gray-500 mt-2">
              Word, Excel or PDF, up to 15MB. Useful on its own: this is simply
              where the school keeps its minutes.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Starts with the usual sections (Principal&apos;s report, Finance
            report and so on). You can add, rename and remove them as you go.
          </p>
        )}
      </div>

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={save}
          disabled={saving}
          className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save minutes"}
        </button>
        <button
          onClick={onClose}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
