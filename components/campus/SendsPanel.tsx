"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import type { Catalogue } from "@/components/trainingUi";

interface SendRow {
  id: string;
  title: string;
  subject: string;
  sendOn: string;
  status: "scheduled" | "sending" | "sent" | "cancelled";
  everyone: boolean;
  recipientCount: number | null;
  sentCount?: number;
  failedCount?: number;
  remindEveryDays: number;
  remindMax: number;
  remindersSent: number;
  createdByName: string;
}
interface Data { sends: SendRow[]; people: { id: string; name: string }[]; today: string }

const input = "px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none";
const blank = { target: "", who: "everyone" as "everyone" | "chosen", userIds: [] as string[], external: "", subject: "", message: "", sendOn: "", remindEveryDays: 0, remindMax: 3 };

// Emailing training to people, now or on a date, with reminders.
export default function SendsPanel({ data, onToast }: { data: Catalogue; onToast: (m: string, type: "success" | "error") => void }) {
  const t = useT();
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await authFetch("/api/training/sends");
    if (r.ok) setD(await r.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const published = [
    ...data.modules.filter((m) => m.status === "published").map((m) => ({ key: `module:${m.id}`, label: `${t("Module")}: ${m.title}` })),
    ...data.materials.filter((m) => m.status === "published").map((m) => ({ key: `material:${m.id}`, label: `${t("Lesson")}: ${m.title}` })),
    ...data.tests.filter((x) => x.status === "published").map((x) => ({ key: `test:${x.id}`, label: `${t("Test")}: ${x.title}` })),
  ];

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const [kind, targetId] = form.target.split(":");
    const later = form.sendOn && d && form.sendOn > d.today;
    if (!later && !confirm(t("Send this now?"))) return;
    setBusy(true);
    const r = await authFetch("/api/training/sends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        targetId,
        everyone: form.who === "everyone",
        userIds: form.who === "chosen" ? form.userIds : [],
        externalEmails: form.external.split(/[\s,;]+/).filter(Boolean),
        subject: form.subject,
        message: form.message,
        sendOn: form.sendOn,
        remindEveryDays: form.remindEveryDays,
        remindMax: form.remindEveryDays ? form.remindMax : 0,
      }),
    });
    const body = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return onToast(body.error || t("That could not be sent."), "error");
    onToast(later ? t("Scheduled for {date}", { date: form.sendOn }) : t("Sent to {n} people", { n: body.sentCount ?? 0 }), "success");
    setForm(blank);
    setOpen(false);
    load();
  };

  const act = async (id: string, action: "cancel" | "stop") => {
    const r = await authFetch(`/api/training/sends/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!r.ok) onToast(t("That could not be changed."), "error");
    load();
  };

  const status = (s: SendRow) =>
    s.status === "scheduled"
      ? t("Goes out {date}", { date: s.sendOn })
      : s.status === "sent"
        ? t("Sent to {n}", { n: s.sentCount ?? 0 }) + (s.failedCount ? `, ${t("{n} failed", { n: s.failedCount })}` : "")
        : s.status === "cancelled"
          ? t("Cancelled")
          : t("Sending...");

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-sm text-gray-500">{t("SEND BY EMAIL")}</h2>
          <p className="text-xs text-gray-400 mt-1">{t("Email training to people, now or on a date, and remind those who have not finished it.")}</p>
        </div>
        <button onClick={() => setOpen(!open)} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium">
          {open ? t("Cancel") : t("Send training")}
        </button>
      </div>

      {open && d && (
        <form onSubmit={send} className="p-4 space-y-4 border-b border-gray-100">
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">{t("What to send")}</span>
            <select required value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value, subject: "" })} className={`${input} w-full`}>
              <option value="">{t("Choose published training...")}</option>
              {published.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </label>
          <div>
            <span className="block text-xs font-medium text-gray-600 mb-1">{t("Who")}</span>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={form.who === "everyone"} onChange={() => setForm({ ...form, who: "everyone" })} />
                {t("Everyone in the portal ({n})", { n: d.people.length })}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={form.who === "chosen"} onChange={() => setForm({ ...form, who: "chosen" })} />
                {t("Chosen people")}
              </label>
            </div>
            {form.who === "chosen" && (
              <div className="mt-2 max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {d.people.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.userIds.includes(p.id)}
                      onChange={(e) => setForm({ ...form, userIds: e.target.checked ? [...form.userIds, p.id] : form.userIds.filter((x) => x !== p.id) })}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">{t("Also send to these email addresses (people without a portal account get a share link)")}</span>
            <textarea value={form.external} onChange={(e) => setForm({ ...form, external: e.target.value })} rows={2} placeholder={t("One or more addresses, separated by commas")} className={`${input} w-full`} />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">{t("Subject (optional)")}</span>
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={200} className={`${input} w-full`} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">{t("Send on (blank = now)")}</span>
              <input type="date" min={d.today} value={form.sendOn} onChange={(e) => setForm({ ...form, sendOn: e.target.value })} className={input} />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">{t("Message (optional)")}</span>
            <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} maxLength={3000} className={`${input} w-full`} />
          </label>
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <span className="text-xs font-medium text-gray-600">{t("Remind people who have not finished:")}</span>
            <select value={form.remindEveryDays} onChange={(e) => setForm({ ...form, remindEveryDays: Number(e.target.value) })} className={input}>
              <option value={0}>{t("No reminders")}</option>
              {[3, 7, 14].map((n) => (
                <option key={n} value={n}>{t("Every {n} days", { n })}</option>
              ))}
            </select>
            {form.remindEveryDays > 0 && (
              <select value={form.remindMax} onChange={(e) => setForm({ ...form, remindMax: Number(e.target.value) })} className={input}>
                {[1, 2, 3, 5].map((n) => (
                  <option key={n} value={n}>{t("Up to {n} times", { n })}</option>
                ))}
              </select>
            )}
          </div>
          <button disabled={busy} className="bg-primary hover:bg-primary-dark text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {busy ? t("Sending...") : form.sendOn && form.sendOn > d.today ? t("Schedule") : t("Send now")}
          </button>
        </form>
      )}

      {d && d.sends.length === 0 && <p className="px-4 py-3 text-xs text-gray-400 italic">{t("Nothing sent yet")}</p>}
      {d?.sends.map((s) => (
        <div key={s.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 text-sm gap-3 flex-wrap">
          <div className="min-w-0">
            <p className={s.status === "cancelled" ? "text-gray-400 line-through" : ""}>{s.subject}</p>
            <p className="text-xs text-gray-400">
              {[status(s), s.remindEveryDays ? t("reminders every {n} days ({sent} of {max} sent)", { n: s.remindEveryDays, sent: s.remindersSent, max: s.remindMax }) : null, s.createdByName]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex gap-3 text-xs shrink-0">
            {s.status === "scheduled" && (
              <button onClick={() => act(s.id, "cancel")} className="text-gray-400 hover:text-red-600">{t("Cancel")}</button>
            )}
            {s.status === "sent" && s.remindEveryDays > 0 && s.remindersSent < s.remindMax && (
              <button onClick={() => act(s.id, "stop")} className="text-gray-400 hover:text-red-600">{t("Stop reminders")}</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
