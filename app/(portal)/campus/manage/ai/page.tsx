"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import { PROVINCES, TRAINING_TOPICS } from "@/lib/trainingTopics";

const input = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none";

export default function BuildWithAiPage() {
  const t = useT();
  const router = useRouter();
  const { session, loading } = useAuth("manage_training");
  const [guidelines, setGuidelines] = useState<{ id: string; name: string; source: string }[]>([]);
  const [form, setForm] = useState({
    topic: TRAINING_TOPICS[0] as string,
    province: "Gauteng",
    focus: "",
    audience: "",
    lessons: 3,
    questions: 10,
    guidelineIds: [] as string[],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    authFetch("/api/guidelines").then(async (r) => r.ok && setGuidelines(await r.json()));
  }, [session]);

  const topicLabel = (x: string) =>
    x === "Provincial education guidelines" ? t("Provincial education guidelines") : x === "Other" ? t("Other (describe below)") : x;

  const build = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await authFetch("/api/training/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) router.push(`/campus/manage/modules/${body.id}`);
    else {
      setError(body.error || t("The module could not be built. Please try again."));
      setBusy(false);
    }
  };

  if (loading) return <div className="p-6">{t("Loading...")}</div>;

  return (
    <div className="max-w-2xl">
      <Link href="/campus/manage" className="text-sm text-primary">&larr; {t("Back to Manage Campus")}</Link>
      <h1 className="text-2xl font-bold text-dark mt-3">{t("Build a module with AI")}</h1>
      <p className="text-gray-500 text-sm mt-1 mb-6">
        {t("AI writes the lessons and the test. Everything is saved as a draft for you to read, correct and then publish. AI can make mistakes about the law, so check it before anybody is taught from it.")}
      </p>
      <form onSubmit={build} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">{t("Topic")}</span>
          <select value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className={input}>
            {TRAINING_TOPICS.map((x) => (
              <option key={x} value={x}>{topicLabel(x)}</option>
            ))}
          </select>
        </label>
        {form.topic === "Provincial education guidelines" && (
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">{t("Province")}</span>
            <select value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} className={input}>
              {PROVINCES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">
            {form.topic === "Other" ? t("What should the module cover?") : t("Focus (optional)")}
          </span>
          <input
            value={form.focus}
            onChange={(e) => setForm({ ...form, focus: e.target.value })}
            required={form.topic === "Other"}
            maxLength={500}
            placeholder={t("e.g. admissions and language policy, learner discipline, school fees")}
            className={input}
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">{t("Who is it for? (optional)")}</span>
          <input
            value={form.audience}
            onChange={(e) => setForm({ ...form, audience: e.target.value })}
            maxLength={200}
            placeholder={t("e.g. new SGB or board of governors members")}
            className={input}
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">{t("Lessons")}</span>
            <input type="number" min={1} max={8} value={form.lessons} onChange={(e) => setForm({ ...form, lessons: Number(e.target.value) })} className={input} />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">{t("Test questions")}</span>
            <input type="number" min={3} max={30} value={form.questions} onChange={(e) => setForm({ ...form, questions: Number(e.target.value) })} className={input} />
          </label>
        </div>
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">{t("Base it on your guidelines (optional, up to 5)")}</span>
          {guidelines.length === 0 ? (
            <p className="text-xs text-gray-400">
              {t("No guidelines uploaded. Upload a GDE circular or provincial guideline under Compliance > Guidelines to have the module built from it.")}
            </p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {guidelines.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.guidelineIds.includes(g.id)}
                    disabled={!form.guidelineIds.includes(g.id) && form.guidelineIds.length >= 5}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        guidelineIds: e.target.checked ? [...form.guidelineIds, g.id] : form.guidelineIds.filter((x) => x !== g.id),
                      })
                    }
                  />
                  {g.name} <span className="text-xs text-gray-400">{g.source}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500">
          {t("The documents are sent to Anthropic's AI in the United States to be read.")}
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {busy ? t("Building... (this takes a few minutes, keep this page open)") : t("Build module")}
        </button>
      </form>
    </div>
  );
}
