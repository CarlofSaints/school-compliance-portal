"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import Toast from "@/components/Toast";
import { DraftPill, stepHref, type Catalogue } from "@/components/trainingUi";
import { MODULE_COLOURS } from "@/lib/trainingTopics";

const input = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none";
type Item = { kind: "material" | "test"; id: string };

export default function ModuleEditorPage() {
  const t = useT();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const { session, loading } = useAuth("manage_training");
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [form, setForm] = useState({ title: "", description: "", topic: "", sequential: true, status: "draft", items: [] as Item[], source: "manual", icon: "🎓", colour: "violet" });
  const [ready, setReady] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!session) return;
    authFetch("/api/training").then(async (r) => r.ok && setCat(await r.json()));
    if (!isNew) {
      authFetch(`/api/training/modules/${id}`).then(async (r) => {
        if (r.ok) setForm(await r.json());
        setReady(true);
      });
    }
  }, [session, id, isNew]);

  if (loading || !ready || !cat) return <div className="p-6">{t("Loading...")}</div>;

  const titleOf = (i: Item) =>
    (i.kind === "material" ? cat.materials : cat.tests).find((x) => x.id === i.id) as { title: string; status: string } | undefined;
  const move = (at: number, by: number) => {
    const items = [...form.items];
    const [x] = items.splice(at, 1);
    items.splice(Math.max(0, Math.min(items.length, at + by)), 0, x);
    setForm({ ...form, items });
  };
  const unused = [
    ...cat.materials.map((m) => ({ kind: "material" as const, id: m.id, title: m.title })),
    ...cat.tests.map((x) => ({ kind: "test" as const, id: x.id, title: x.title })),
  ].filter((o) => !form.items.some((i) => i.kind === o.kind && i.id === o.id));

  const save = async (status: string) => {
    setSaving(true);
    const res = await authFetch(isNew ? "/api/training/modules" : `/api/training/modules/${id}`, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, status }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setToast({ message: body.error || t("That could not be saved."), type: "error" });
    setForm(body);
    setToast({ message: status === "published" ? t("Published. Everybody in the portal can now take it.") : t("Saved as a draft"), type: "success" });
    if (isNew) router.replace(`/campus/manage/modules/${body.id}`);
    authFetch("/api/training").then(async (r) => r.ok && setCat(await r.json()));
  };

  return (
    <div className="max-w-3xl">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <Link href="/campus/manage" className="text-sm text-primary">&larr; {t("Back to Manage Campus")}</Link>
      <div className="flex items-center justify-between mt-3 mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-dark">
          {isNew ? t("New module") : form.title}
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
      {form.source === "ai" && form.status !== "published" && (
        <p className="text-sm bg-violet-50 border border-violet-200 text-violet-800 rounded-lg p-4 mb-4">
          {t("Built by AI. Open each lesson and the test below, read them and correct anything wrong, then press Publish. Publishing the module publishes its steps too.")}
        </p>
      )}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">{t("Title")}</span>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} className={input} />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">{t("Description")}</span>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={2000} className={input} />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">{t("Topic (optional)")}</span>
          <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} maxLength={200} className={input} />
        </label>
        <div className="flex gap-4 items-end flex-wrap">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">{t("Icon (an emoji)")}</span>
            <input value={form.icon ?? ""} onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={16} className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-2xl text-center" />
          </label>
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1">{t("Colour")}</span>
            <div className="flex gap-2">
              {Object.entries(MODULE_COLOURS).map(([key, c]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm({ ...form, colour: key })}
                  aria-label={key}
                  className={`w-8 h-8 rounded-full ${c.band} ${(form.colour ?? "violet") === key ? "ring-2 ring-offset-2 ring-gray-800" : ""}`}
                />
              ))}
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.sequential} onChange={(e) => setForm({ ...form, sequential: e.target.checked })} />
          {t("Steps must be done in order (each one unlocks when the one before it is done)")}
        </label>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mt-4">
        <h2 className="font-medium text-sm text-gray-500 p-4 border-b border-gray-100">{t("STEPS")} ({form.items.length})</h2>
        {form.items.map((i, at) => {
          const info = titleOf(i);
          return (
            <div key={`${i.kind}:${i.id}`} className="flex items-center justify-between px-4 py-2 border-b border-gray-50 text-sm gap-3">
              <span>
                {at + 1}. {info?.title ?? t("(deleted)")}
                <span className="text-xs text-gray-400 ml-2">{i.kind === "test" ? t("Test") : t("Lesson")}</span>
                {info && info.status !== "published" && <DraftPill />}
              </span>
              <span className="flex items-center gap-3 shrink-0 text-xs">
                <Link href={`/campus/manage/${i.kind === "material" ? "materials" : "tests"}/${i.id}`} className="text-primary">{t("Edit")}</Link>
                <Link href={stepHref(i)} className="text-gray-500">{t("Preview")}</Link>
                <button onClick={() => move(at, -1)} disabled={at === 0} className="text-gray-400 disabled:opacity-30" aria-label={t("Move up")}>↑</button>
                <button onClick={() => move(at, 1)} disabled={at === form.items.length - 1} className="text-gray-400 disabled:opacity-30" aria-label={t("Move down")}>↓</button>
                <button onClick={() => setForm({ ...form, items: form.items.filter((_, x) => x !== at) })} className="text-gray-400 hover:text-red-600">{t("Remove")}</button>
              </span>
            </div>
          );
        })}
        <div className="p-4">
          <select
            value=""
            onChange={(e) => {
              const [kind, sid] = e.target.value.split(":");
              if (sid) setForm({ ...form, items: [...form.items, { kind: kind as Item["kind"], id: sid }] });
            }}
            className={input}
          >
            <option value="">{t("+ Add a lesson or test...")}</option>
            {unused.map((o) => (
              <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>
                {o.kind === "test" ? t("Test") : t("Lesson")}: {o.title}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
