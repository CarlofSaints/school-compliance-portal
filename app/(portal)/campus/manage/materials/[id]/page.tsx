"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import Toast from "@/components/Toast";
import FileUpload from "@/components/FileUpload";
import LessonText from "@/components/LessonText";
import { DraftPill } from "@/components/trainingUi";

const input = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none";

export default function MaterialEditorPage() {
  const t = useT();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const { session, loading } = useAuth("manage_training");
  const [form, setForm] = useState({ title: "", description: "", body: "", status: "draft", source: "manual", estimatedMinutes: 0 as number | undefined });
  const [existingFile, setExistingFile] = useState<{ filename: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(false);
  const [ready, setReady] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!session || isNew) return;
    authFetch(`/api/training/materials/${id}?edit=1`).then(async (r) => {
      if (r.ok) {
        const m = await r.json();
        setForm(m);
        setExistingFile(m.file ?? null);
      }
      setReady(true);
    });
  }, [session, id, isNew]);

  const save = async (status: string) => {
    setSaving(true);
    const fd = new FormData();
    fd.append("title", form.title);
    fd.append("description", form.description);
    fd.append("body", form.body);
    fd.append("estimatedMinutes", String(form.estimatedMinutes ?? 0));
    fd.append("status", status);
    if (file) fd.append("file", file);
    const res = await authFetch(isNew ? "/api/training/materials" : `/api/training/materials/${id}`, { method: isNew ? "POST" : "PUT", body: fd });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setToast({ message: body.error || t("That could not be saved."), type: "error" });
    setForm(body);
    setExistingFile(body.file ?? null);
    setFile(null);
    setToast({ message: status === "published" ? t("Published") : t("Saved as a draft"), type: "success" });
    if (isNew) router.replace(`/campus/manage/materials/${body.id}`);
  };

  if (loading || !ready) return <div className="p-6">{t("Loading...")}</div>;

  return (
    <div className="max-w-3xl">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <Link href="/campus/manage" className="text-sm text-primary">&larr; {t("Back to Manage Campus")}</Link>
      <div className="flex items-center justify-between mt-3 mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-dark">
          {isNew ? t("New material") : form.title}
          {form.status !== "published" && <DraftPill />}
        </h1>
        <div className="flex gap-2">
          <button onClick={() => save("draft")} disabled={saving} className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
            {form.status === "published" ? t("Unpublish") : t("Save draft")}
          </button>
          <button onClick={() => save("published")} disabled={saving} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {form.status === "published" ? t("Save") : t("Publish")}
          </button>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">{t("Title")}</span>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} className={input} />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">{t("Short description")}</span>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={2000} className={input} />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">{t("Reading time in minutes (blank = worked out from the length)")}</span>
          <input
            type="number"
            min={0}
            max={600}
            value={form.estimatedMinutes || ""}
            onChange={(e) => setForm({ ...form, estimatedMinutes: Number(e.target.value) || undefined })}
            className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">{t("Lesson text")}</span>
            <button type="button" onClick={() => setPreview(!preview)} className="text-xs text-primary">
              {preview ? t("Edit") : t("Preview")}
            </button>
          </div>
          {preview ? (
            <div className="border border-gray-100 rounded-lg p-4"><LessonText body={form.body} /></div>
          ) : (
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={16}
              className={`${input} font-mono`}
              placeholder={t("Write the lesson. Use ## for a heading and - for a bullet point.")}
            />
          )}
        </div>
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">{t("Or upload a document (optional)")}</span>
          {existingFile && !file && <p className="text-xs text-gray-500 mb-2">{t("Current document: {name}", { name: existingFile.filename })}</p>}
          <FileUpload onChange={setFile} value={file} accept=".pdf,.docx,.doc,.pptx,.xlsx,.txt,.jpg,.jpeg,.png" label={t("Upload material (PDF, Word, PowerPoint, Excel, image)")} />
        </div>
      </div>
    </div>
  );
}
