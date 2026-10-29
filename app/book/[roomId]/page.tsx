"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useT } from "@/components/I18nProvider";
import { useBranding } from "@/components/BrandingProvider";
import SchoolCrest from "@/components/SchoolCrest";
import LanguagePicker from "@/components/LanguagePicker";
import {
  addDays,
  dayShortName,
  labelToMinute,
  longDateLabel,
  minuteLabel,
  sastNowMinute,
  sastToday,
  slotStarts,
  weekDays,
  weekRangeLabel,
  weekStart,
} from "@/lib/roomBookings";

// A room's PUBLIC page: an outside group (a church renting the hall) sees when
// the room is taken and asks for a free time. No sign-in. The booking holds the
// time at once and waits for a room manager to approve it.

type Taken = { date: string; startMinute: number; endMinute: number };
type RoomInfo = { id: string; name: string; capacity: number; notes: string };

const FIRST = 7 * 60;
const LAST = 22 * 60;
const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export default function PublicBookingPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const t = useT();
  const branding = useBranding();
  const [monday, setMonday] = useState(() => weekStart(sastToday()));
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [taken, setTaken] = useState<Taken[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({
    title: "",
    date: "",
    start: "",
    end: "",
    attendeeCount: 1,
    name: "",
    organisation: "",
    email: "",
    phone: "",
    consent: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setTaken(null);
    const res = await fetch(`/api/public/rooms/${encodeURIComponent(roomId)}?week=${monday}`, { cache: "no-store" });
    if (!res.ok) return setMissing(true);
    const data = await res.json();
    setRoom(data.room);
    setTaken(data.taken);
  }, [roomId, monday]);
  useEffect(() => {
    load().catch(() => setMissing(true));
  }, [load]);

  const today = sastToday();
  const nowMin = sastNowMinute();
  const isTaken = (date: string, m: number) =>
    (taken ?? []).some((b) => b.date === date && b.startMinute < m + 30 && b.endMinute > m);
  const isPast = (date: string, m: number) => date < today || (date === today && m < nowMin);
  const pick = (date: string, m: number) =>
    setForm({ ...form, date, start: minuteLabel(m), end: minuteLabel(Math.min(m + 60, 24 * 60)) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const startMinute = labelToMinute(form.start);
    const endMinute = labelToMinute(form.end);
    if (!form.date || startMinute === null || endMinute === null) return setError(t("Pick a date and times"));
    setBusy(true);
    setError("");
    const res = await fetch(`/api/public/rooms/${encodeURIComponent(roomId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, startMinute, endMinute }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setError(t("Could not reach the server. Check your connection and try again."));
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(t(data.error || "Failed"));
      if (res.status === 409) load();
      return;
    }
    setDone(true);
  };

  if (missing) {
    return (
      <Shell name={branding.fullName}>
        <p className="text-gray-600">{t("This booking link isn't available. Ask the school for a new one.")}</p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell name={branding.fullName}>
        <h1 className="text-xl font-bold text-dark">{t("Thank you, your request is in")}</h1>
        <p className="mt-2 text-gray-600">
          {t(
            "{room} is held for you on {date}, {start} to {end}. The school will approve or decline it, and you will get an email either way.",
            { room: room?.name ?? "", date: longDateLabel(form.date, t), start: form.start, end: form.end }
          )}
        </p>
      </Shell>
    );
  }

  const days = weekDays(monday);

  return (
    <Shell name={branding.fullName}>
      <h1 className="text-2xl font-bold text-dark">{t("Book {room}", { room: room?.name ?? "" })}</h1>
      {room && (
        <p className="mt-1 text-sm text-gray-500">
          {t("seats {n}", { n: room.capacity })}
          {room.notes ? ` · ${room.notes}` : ""}
        </p>
      )}
      <p className="mt-3 text-sm text-gray-600">
        {t("Grey times are taken. Click a free time to start, then fill in your details. The school approves every booking.")}
      </p>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonday(addDays(monday, -7))}
          disabled={monday <= weekStart(today)}
          className="rounded-lg border px-3 py-1 text-sm disabled:opacity-40"
          aria-label={t("Previous week")}
        >
          ‹
        </button>
        <span className="text-sm font-medium">{weekRangeLabel(monday, t)}</span>
        <button
          type="button"
          onClick={() => setMonday(addDays(monday, 7))}
          className="rounded-lg border px-3 py-1 text-sm"
          aria-label={t("Next week")}
        >
          ›
        </button>
      </div>

      <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
        <div className="grid min-w-[640px]" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
          <div />
          {days.map((d) => (
            <div key={d} className="border-l border-gray-100 py-1 text-center text-xs font-medium text-gray-600">
              {dayShortName(d, t)} {Number(d.slice(8))}
            </div>
          ))}
          {slotStarts(FIRST, LAST).map((m) => (
            <div key={m} className="contents">
              <div className="pr-1 text-right text-[10px] leading-6 text-gray-400">{m % 60 === 0 ? minuteLabel(m) : ""}</div>
              {days.map((d) => {
                const busySlot = taken === null || isTaken(d, m);
                const past = isPast(d, m);
                const chosen = form.date === d && form.start === minuteLabel(m);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={busySlot || past}
                    onClick={() => pick(d, m)}
                    aria-label={
                      busySlot ? t("Taken") : t("Book {time} on {date}", { time: minuteLabel(m), date: longDateLabel(d, t) })
                    }
                    className={`h-6 border-l border-t border-gray-100 text-[10px] ${
                      chosen
                        ? "bg-primary text-white"
                        : busySlot
                          ? "bg-gray-300 text-gray-600"
                          : past
                            ? "bg-gray-50"
                            : "bg-white hover:bg-primary/10"
                    }`}
                  >
                    {busySlot && taken !== null && m % 60 === 0 ? t("Taken") : ""}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium">{t("What is the booking for?")}</span>
          <input required maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={`${inputCls} mt-1`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{t("Date")}</span>
          <input required type="date" min={today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${inputCls} mt-1`} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="font-medium">{t("Starts")}</span>
            <input required type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={`${inputCls} mt-1`} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t("Ends")}</span>
            <input required type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={`${inputCls} mt-1`} />
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-medium">{t("Number of attendees")}</span>
          <input
            required
            type="number"
            min={1}
            max={room?.capacity ?? 500}
            value={form.attendeeCount}
            onChange={(e) => setForm({ ...form, attendeeCount: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{t("Your name")}</span>
          <input required maxLength={100} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inputCls} mt-1`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{t("Organisation (optional)")}</span>
          <input maxLength={120} autoComplete="organization" value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} className={`${inputCls} mt-1`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{t("Email")}</span>
          <input required type="email" maxLength={200} autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${inputCls} mt-1`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{t("Phone")}</span>
          <input required type="tel" maxLength={30} autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${inputCls} mt-1`} />
        </label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" required checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-1 accent-primary" />
          <span>
            {t("I agree that the school keeps my name, email and phone number to manage this booking and contact me about it.")}{" "}
            <a href="https://schoolcompliance.co.za/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {t("Privacy")}
            </a>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-risk-high sm:col-span-2">
            {error}
          </p>
        )}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? t("Sending...") : t("Request this booking")}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Shell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SchoolCrest width={40} height={48} />
            <span className="font-semibold text-dark">{name}</span>
          </div>
          <LanguagePicker />
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
