"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import Toast from "@/components/Toast";
import DownloadLink from "@/components/DownloadLink";
import { useT } from "@/components/I18nProvider";
import { longDateLabel, slotLabel, sastToday } from "@/lib/roomBookings";
import { meetingTypeLabel, type MeetingType } from "@/lib/meetingTypes";
import type { Meeting } from "@/lib/meetings";

// Events and meetings (FINCOM, SGB, AGM, a fun day). Separate from room
// bookings: a room is optional, booked through the room calendar when ticked.
// Every invitee gets an email with a calendar file, and a reminder the day before.

type Row = Meeting & { invitees: { name: string; email?: string }[] };
interface Options {
  tags: { id: string; name: string }[];
  people: { key: string; name: string; email: string }[];
  types: MeetingType[];
  rooms: { id: string; name: string; capacity: number }[];
}

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMinute = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
};

const blank = () => ({
  title: "",
  typeId: "",
  date: sastToday(),
  start: "17:00",
  end: "18:00",
  withRoom: false,
  roomId: "",
  venue: "",
  notes: "",
  tagIds: [] as string[],
  personKeys: [] as string[],
});

export default function MeetingsPage() {
  const t = useT();
  const { session, loading } = useAuth();
  const manager = !!session?.permissions.includes("manage_meetings");
  const [rows, setRows] = useState<Row[]>([]);
  const [opts, setOpts] = useState<Options>({ tags: [], people: [], types: [], rooms: [] });
  const [showPast, setShowPast] = useState(false);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    const res = await authFetch("/api/meetings");
    return res.ok ? res.json() : null;
  }, []);
  const apply = (d: (Options & { meetings: Row[] }) | null) => {
    if (!d) return;
    setRows(d.meetings);
    setOpts({ tags: d.tags ?? [], people: d.people ?? [], types: d.types ?? [], rooms: d.rooms ?? [] });
  };
  useEffect(() => {
    if (session) load().then(apply);
  }, [session, load]);

  const today = sastToday();
  const shown = useMemo(
    () => rows.filter((m) => (showPast ? m.date < today || m.status === "cancelled" : m.date >= today && m.status === "scheduled")),
    [rows, showPast, today]
  );

  const open = (m: Row | "new") => {
    setEditing(m);
    setSearch("");
    setForm(
      m === "new"
        ? blank()
        : {
            title: m.title,
            typeId: m.typeId,
            date: m.date,
            start: toTime(m.startMinute),
            end: toTime(m.endMinute),
            withRoom: !!m.room,
            roomId: m.room?.roomId ?? "",
            venue: m.room ? "" : m.venue,
            notes: m.notes,
            tagIds: m.tagIds,
            personKeys: m.personKeys,
          }
    );
  };

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const sentNotice = (r: { sent: number; failed: number }) =>
    r.failed
      ? { message: t("Emailed {n} people, but {f} could not be reached.", { n: r.sent, f: r.failed }), type: "error" as const }
      : { message: t("Emailed {n} people.", { n: r.sent }), type: "success" as const };

  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      setToast({ message: await apiErrorMessage(res, t("Failed")), type: "error" });
      return null;
    }
    return res.json();
  };

  const save = async () => {
    if (!editing) return;
    if (form.withRoom && !form.roomId) return setToast({ message: t("Pick a room"), type: "error" });
    const body = {
      title: form.title,
      typeId: form.typeId,
      date: form.date,
      startMinute: toMinute(form.start),
      endMinute: toMinute(form.end),
      venue: form.withRoom ? "" : form.venue,
      roomId: form.withRoom ? form.roomId : "",
      notes: form.notes,
      tagIds: form.tagIds,
      personKeys: form.personKeys,
    };
    const r = editing === "new" ? await call("/api/meetings", "POST", body) : await call(`/api/meetings/${editing.id}`, "PUT", body);
    if (!r) return;
    setEditing(null);
    setToast(sentNotice(r));
    apply(await load());
  };

  const remind = async (m: Row) => {
    if (!confirm(t("Email a reminder about \"{name}\" to everyone invited, now?", { name: m.title }))) return;
    const r = await call(`/api/meetings/${m.id}`, "POST", { action: "remind" });
    if (r) {
      setToast(sentNotice(r));
      apply(await load());
    }
  };

  const cancel = async (m: Row) => {
    if (!confirm(t("Cancel \"{name}\"? Everyone invited is emailed, and the room booking (if any) is let go.", { name: m.title }))) return;
    const r = await call(`/api/meetings/${m.id}`, "DELETE");
    if (r) {
      setToast(sentNotice(r));
      apply(await load());
    }
  };

  if (loading) return <div className="p-6">{t("Loading...")}</div>;

  const people = opts.people.filter((p) => !search || `${p.name} ${p.email}`.toLowerCase().includes(search.toLowerCase()));
  const input = "mt-1 w-full border border-gray-300 rounded-lg px-3 py-2";

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Meetings & Events")}</h1>
          <p className="text-gray-500 text-sm">{t("Everyone invited gets an email that adds the meeting to their own calendar, and a reminder the day before.")}</p>
        </div>
        {manager && (
          <button onClick={() => open("new")} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            {t("+ Schedule an event or meeting")}
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-2 text-sm">
        <button onClick={() => setShowPast(false)} className={`rounded-lg px-3 py-1.5 ${!showPast ? "bg-primary text-white" : "bg-gray-100 text-gray-700"}`}>{t("Upcoming")}</button>
        <button onClick={() => setShowPast(true)} className={`rounded-lg px-3 py-1.5 ${showPast ? "bg-primary text-white" : "bg-gray-100 text-gray-700"}`}>{t("Past and cancelled")}</button>
      </div>

      {shown.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
          {showPast ? t("Nothing here yet.") : t("No upcoming meetings or events.")}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
          {shown.map((m) => (
            <div key={m.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-dark">{m.title}</span>
                  {m.typeId && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{meetingTypeLabel(opts.types, m.typeId)}</span>}
                  {m.status === "cancelled" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-risk-high">{t("Cancelled")}</span>}
                </div>
                <p className="text-sm text-gray-600">
                  {longDateLabel(m.date, t)}, {slotLabel(m.startMinute, m.endMinute, t)}
                  {m.venue && <> · {m.venue}</>}
                  {m.room && <span className="text-gray-400"> ({t("room booked")})</span>}
                </p>
                <p className="text-xs text-gray-500" title={m.invitees.map((i) => i.name).join(", ")}>
                  {t("{n} invited", { n: m.invitees.length })}: {m.invitees.slice(0, 6).map((i) => i.name).join(", ")}
                  {m.invitees.length > 6 ? "…" : ""}
                </p>
                {m.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-gray-500">{m.notes}</p>}
                {manager && m.lastReminderAt && (
                  <p className="text-xs text-gray-400">{t("Last reminder sent {when}", { when: new Date(m.lastReminderAt).toLocaleString() })}</p>
                )}
              </div>
              {m.status === "scheduled" && (
                <div className="flex shrink-0 flex-wrap items-center gap-3 text-sm">
                  <DownloadLink href={`/api/meetings/${m.id}`} filename="meeting.ics" className="text-primary hover:underline" onError={(msg) => setToast({ message: msg, type: "error" })}>
                    {t("Add to my calendar")}
                  </DownloadLink>
                  {manager && m.date >= today && (
                    <>
                      <button disabled={busy} onClick={() => remind(m)} className="text-primary hover:underline">{t("Send reminder now")}</button>
                      <button disabled={busy} onClick={() => open(m)} className="text-primary hover:underline">{t("Edit")}</button>
                      <button disabled={busy} onClick={() => cancel(m)} className="text-risk-high hover:underline">{t("Cancel meeting")}</button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h3 className="text-lg font-semibold">{editing === "new" ? t("Schedule an event or meeting") : t("Edit {name}", { name: editing.title })}</h3>
            <label className="block text-sm">
              <span className="font-medium">{t("Name")}</span>
              <input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} placeholder={t("e.g. FINCOM meeting")} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("Meeting type")}</span>
              <select value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })} className={input}>
                <option value="">{t("None (an event)")}</option>
                {opts.types.map((ty) => (
                  <option key={ty.id} value={ty.id}>{ty.label}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <label className="block">
                <span className="font-medium">{t("Date")}</span>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
              </label>
              <label className="block">
                <span className="font-medium">{t("Starts")}</span>
                <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={input} />
              </label>
              <label className="block">
                <span className="font-medium">{t("Ends")}</span>
                <input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={input} />
              </label>
            </div>

            {opts.rooms.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.withRoom} onChange={(e) => setForm({ ...form, withRoom: e.target.checked })} />
                <span className="font-medium">{t("Would you like to book a room for this?")}</span>
              </label>
            )}
            {form.withRoom ? (
              <label className="block text-sm">
                <span className="font-medium">{t("Room")}</span>
                <select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })} className={input}>
                  <option value="">{t("Pick a room")}</option>
                  {opts.rooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({t("seats {n}", { n: r.capacity })})</option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-gray-500">{t("Booked on the room calendar. If the room is taken at that time, you will be told.")}</span>
              </label>
            ) : (
              <label className="block text-sm">
                <span className="font-medium">{t("Where")}</span>
                <input value={form.venue} maxLength={300} onChange={(e) => setForm({ ...form, venue: e.target.value })} className={input} placeholder={t("A place, or a Teams or Zoom link")} />
              </label>
            )}

            <div className="text-sm">
              <span className="font-medium">{t("Invite by tag")}</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {opts.tags.length === 0 && <span className="text-xs text-gray-500">{t("No tags yet. Create them on Admin, Tags.")}</span>}
                {opts.tags.map((tg) => (
                  <button
                    key={tg.id}
                    type="button"
                    onClick={() => setForm({ ...form, tagIds: toggle(form.tagIds, tg.id) })}
                    className={`rounded-full border px-3 py-1 text-xs ${form.tagIds.includes(tg.id) ? "border-primary bg-primary text-white" : "border-gray-300 text-gray-700"}`}
                  >
                    {tg.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-sm">
              <span className="font-medium">{t("Invite people")}</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} className={input} placeholder={t("Search by name or email")} />
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                {people.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 px-3 py-1.5">
                    <input type="checkbox" checked={form.personKeys.includes(p.key)} onChange={() => setForm({ ...form, personKeys: toggle(form.personKeys, p.key) })} />
                    <span>{p.name}</span>
                    <span className="truncate text-xs text-gray-400">{p.email}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="block text-sm">
              <span className="font-medium">{t("Notes (optional)")}</span>
              <textarea value={form.notes} maxLength={2000} rows={3} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={input} placeholder={t("Agenda, what to bring...")} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-600">{t("Close")}</button>
              <button disabled={busy} onClick={save} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {busy ? t("Sending...") : editing === "new" ? t("Schedule and send invitations") : t("Save and email the changes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
