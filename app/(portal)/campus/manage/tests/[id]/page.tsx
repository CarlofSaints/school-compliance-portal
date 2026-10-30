"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import Toast from "@/components/Toast";
import { DraftPill } from "@/components/trainingUi";

const input = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none";

type QType = "single" | "multi" | "truefalse" | "text";
interface Q {
  id: string;
  type: QType;
  text: string;
  points: number;
  options: { id: string; text: string; isCorrect: boolean }[];
  acceptedAnswers: string[];
  caseSensitive: boolean;
  allowTypos: boolean;
  explanation: string;
}

const newId = () => crypto.randomUUID();
const blankQuestion = (): Q => ({
  id: newId(),
  type: "single",
  text: "",
  points: 1,
  options: [0, 1, 2, 3].map(() => ({ id: newId(), text: "", isCorrect: false })),
  acceptedAnswers: [],
  caseSensitive: false,
  allowTypos: true,
  explanation: "",
});

export default function TestEditorPage() {
  const t = useT();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const { session, loading } = useAuth("manage_training");
  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "draft",
    passMark: 70,
    maxAttempts: 0,
    showAnswers: true,
    questions: [blankQuestion()] as Q[],
  });
  const [ready, setReady] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!session || isNew) return;
    authFetch(`/api/training/tests/${id}?edit=1`).then(async (r) => {
      if (r.ok) setForm(await r.json());
      setReady(true);
    });
  }, [session, id, isNew]);

  const setQ = (at: number, change: Partial<Q>) =>
    setForm((f) => ({ ...f, questions: f.questions.map((q, i) => (i === at ? { ...q, ...change } : q)) }));

  const changeType = (at: number, type: QType) => {
    const q = form.questions[at];
    if (type === "truefalse") {
      setQ(at, { type, options: [{ id: newId(), text: "True", isCorrect: true }, { id: newId(), text: "False", isCorrect: false }] });
    } else if (type === "text") {
      setQ(at, { type, options: [] });
    } else {
      const options = q.type === "truefalse" || q.options.length < 2 ? blankQuestion().options : q.options;
      setQ(at, { type, options: type === "single" ? options.map((o, i) => ({ ...o, isCorrect: i === options.findIndex((x) => x.isCorrect) })) : options });
    }
  };

  const tick = (at: number, optAt: number) => {
    const q = form.questions[at];
    setQ(at, {
      options: q.options.map((o, i) =>
        q.type === "multi" ? (i === optAt ? { ...o, isCorrect: !o.isCorrect } : o) : { ...o, isCorrect: i === optAt }
      ),
    });
  };

  const save = async (status: string) => {
    setSaving(true);
    const res = await authFetch(isNew ? "/api/training/tests" : `/api/training/tests/${id}`, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, status }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setToast({ message: body.error || t("That could not be saved."), type: "error" });
    setForm(body);
    setToast({ message: status === "published" ? t("Published") : t("Saved as a draft"), type: "success" });
    if (isNew) router.replace(`/campus/manage/tests/${body.id}`);
  };

  if (loading || !ready) return <div className="p-6">{t("Loading...")}</div>;

  return (
    <div className="max-w-3xl">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <Link href="/campus/manage" className="text-sm text-primary">&larr; {t("Back to Manage Campus")}</Link>
      <div className="flex items-center justify-between mt-3 mb-4 gap-3 flex-wrap sticky top-0 bg-gray-50 py-2 z-10">
        <h1 className="text-2xl font-bold text-dark">
          {isNew ? t("New test") : form.title}
          {form.status !== "published" && <DraftPill />}
        </h1>
        <div className="flex gap-2">
          <button onClick={() => save("draft")} disabled={saving} className="border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
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
          <span className="block text-sm font-medium text-gray-700 mb-1">{t("Description")}</span>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={2000} className={input} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">{t("Pass mark (%)")}</span>
            <input type="number" min={0} max={100} value={form.passMark} onChange={(e) => setForm({ ...form, passMark: Number(e.target.value) })} className={input} />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">{t("Attempts allowed (0 = no limit)")}</span>
            <input type="number" min={0} max={50} value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })} className={input} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.showAnswers} onChange={(e) => setForm({ ...form, showAnswers: e.target.checked })} />
          {t("Show the right answers and explanations after each attempt")}
        </label>
      </div>

      {form.questions.map((q, at) => (
        <div key={q.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-dark">{t("Question {n}", { n: at + 1 })}</span>
            <div className="flex items-center gap-3">
              <select value={q.type} onChange={(e) => changeType(at, e.target.value as QType)} className="px-2 py-1 border border-gray-200 rounded text-xs">
                <option value="single">{t("One right answer")}</option>
                <option value="multi">{t("Several right answers")}</option>
                <option value="truefalse">{t("True or false")}</option>
                <option value="text">{t("Typed answer")}</option>
              </select>
              <label className="text-xs text-gray-500 flex items-center gap-1">
                {t("Points")}
                <input type="number" min={0} max={100} value={q.points} onChange={(e) => setQ(at, { points: Number(e.target.value) })} className="w-14 px-2 py-1 border border-gray-200 rounded text-xs" />
              </label>
              <button
                onClick={() => setForm({ ...form, questions: form.questions.filter((_, i) => i !== at) })}
                className="text-xs text-gray-400 hover:text-red-600"
              >
                {t("Remove")}
              </button>
            </div>
          </div>
          <textarea value={q.text} onChange={(e) => setQ(at, { text: e.target.value })} rows={2} placeholder={t("The question")} className={input} />
          {q.type === "text" ? (
            <div className="space-y-2">
              <textarea
                value={q.acceptedAnswers.join("\n")}
                onChange={(e) => setQ(at, { acceptedAnswers: e.target.value.split("\n") })}
                rows={3}
                placeholder={t("Accepted answers, one per line")}
                className={input}
              />
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={q.allowTypos} onChange={(e) => setQ(at, { allowTypos: e.target.checked })} />
                {t("Allow spelling mistakes (a letter or two)")}
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={q.caseSensitive} onChange={(e) => setQ(at, { caseSensitive: e.target.checked })} />
                {t("Capital letters must match")}
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">{q.type === "multi" ? t("Tick every right answer.") : t("Tick the right answer.")}</p>
              {q.options.map((o, optAt) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input type={q.type === "multi" ? "checkbox" : "radio"} name={`correct-${q.id}`} checked={o.isCorrect} onChange={() => tick(at, optAt)} />
                  <input
                    value={o.text}
                    disabled={q.type === "truefalse"}
                    onChange={(e) => setQ(at, { options: q.options.map((x, i) => (i === optAt ? { ...x, text: e.target.value } : x)) })}
                    placeholder={t("Option {n}", { n: optAt + 1 })}
                    className={input}
                  />
                  {q.type !== "truefalse" && q.options.length > 2 && (
                    <button onClick={() => setQ(at, { options: q.options.filter((_, i) => i !== optAt) })} className="text-gray-400 hover:text-red-600 text-xs" aria-label={t("Remove")}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {q.type !== "truefalse" && q.options.length < 10 && (
                <button onClick={() => setQ(at, { options: [...q.options, { id: newId(), text: "", isCorrect: false }] })} className="text-xs text-primary">
                  {t("+ Add option")}
                </button>
              )}
            </div>
          )}
          <textarea
            value={q.explanation}
            onChange={(e) => setQ(at, { explanation: e.target.value })}
            rows={2}
            placeholder={t("Explanation shown after marking (optional), e.g. the section of the Act")}
            className={input}
          />
        </div>
      ))}
      <button onClick={() => setForm({ ...form, questions: [...form.questions, blankQuestion()] })} className="mt-4 border border-dashed border-gray-300 w-full py-3 rounded-xl text-sm text-gray-600 hover:bg-white">
        {t("+ Add question")}
      </button>
    </div>
  );
}
