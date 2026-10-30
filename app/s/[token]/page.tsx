"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useT } from "@/components/I18nProvider";
import { MODULE_COLOURS, type ModuleColour } from "@/lib/trainingTopics";
import { GuestShell, guestFetch, guestStepHref, type ShareView } from "@/components/campus/guest";

const input = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none";

// A Campus share link: anyone with it may do this training without an
// account. They say who they are first (checked against nothing).
export default function SharePage() {
  const t = useT();
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<ShareView | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", surname: "", email: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await guestFetch(`/api/share/${token}`);
    const body = await r.json().catch(() => ({}));
    if (r.ok) setView(body);
    else setError(body.error || t("This link could not be opened."));
  }, [token, t]);

  useEffect(() => {
    load();
  }, [load]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await guestFetch(`/api/share/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) load();
    else setError(body.error || t("Something went wrong. Please try again."));
  };

  if (!view) {
    return (
      <GuestShell>
        <p className="text-sm text-gray-700">{error || t("Loading...")}</p>
      </GuestShell>
    );
  }
  const c = MODULE_COLOURS[view.colour as ModuleColour] ?? MODULE_COLOURS.violet;
  const done = view.items.filter((i) => i.done).length;

  return (
    <GuestShell school={view.school}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className={`${c.band} px-6 py-5 flex items-center gap-4 text-white`}>
          <span className="text-4xl" aria-hidden>{view.icon}</span>
          <div>
            <h1 className="text-xl font-bold">{view.title}</h1>
            {view.guest && <p className="text-sm text-white/80">{t("{done} of {total} done", { done, total: view.items.length })}</p>}
          </div>
        </div>
        <div className="p-6">
          {view.description && <p className="text-sm text-gray-600 mb-4">{view.description}</p>}
          {!view.guest ? (
            <form onSubmit={join} className="space-y-3 max-w-md">
              <p className="text-sm text-gray-700">{t("Before you start, tell us who you are so your progress and results are kept.")}</p>
              <input required placeholder={t("First name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} className={input} />
              <input required placeholder={t("Surname")} value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} maxLength={80} className={input} />
              <input required type="email" placeholder={t("Email address")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={200} className={input} />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button disabled={busy} className="bg-primary hover:bg-primary-dark text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {busy ? t("Starting...") : t("Start")}
              </button>
              <p className="text-xs text-gray-400">{t("Use the same email address if you come back later, to carry on where you left off.")}</p>
            </form>
          ) : (
            <>
              <p className="text-sm text-gray-700 mb-3">{t("Welcome, {name}.", { name: view.guest.name })}</p>
              <ol className="space-y-1.5">
                {view.items.map((s, i) =>
                  s.locked ? (
                    <li key={s.id} className="flex items-center gap-3 text-sm text-gray-400 px-3 py-2 rounded-lg bg-gray-50">
                      <span className="text-lg w-6 text-center">🔒</span>
                      <span className="flex-1">
                        {i + 1}. {s.title}
                      </span>
                    </li>
                  ) : (
                    <li key={s.id}>
                      <Link href={guestStepHref(token, s)} className={`flex items-center gap-3 text-sm px-3 py-2 rounded-lg ${c.hover} ${s.done ? c.soft : ""}`}>
                        <span className="text-lg w-6 text-center" aria-hidden>{s.icon}</span>
                        <span className="flex-1 text-gray-800">
                          {i + 1}. {s.title}
                        </span>
                        <span className={`text-xs font-medium ${s.done ? "text-emerald-600" : "text-gray-400"}`}>
                          {s.done ? (s.kind === "test" ? t("Passed") : t("Read")) : s.kind === "test" ? t("Test") : t("Lesson")}
                        </span>
                      </Link>
                    </li>
                  )
                )}
              </ol>
            </>
          )}
        </div>
      </div>
    </GuestShell>
  );
}
