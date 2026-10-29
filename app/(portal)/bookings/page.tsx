"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import Toast from "@/components/Toast";
import { useT } from "@/components/I18nProvider";
import { tk, type T } from "@/lib/i18n/translate";
import type { BookingView } from "@/lib/roomBookingData";
import {
  DAY_END_MINUTE,
  DAY_SHORT,
  DEFAULT_RECURRENCE,
  MAX_OCCURRENCES,
  MIN_DURATION,
  SCROLL_TO_MINUTE,
  SLOT_MINUTES,
  addDays,
  dayShortName,
  describeRecurrence,
  durationLabel,
  recurrenceSize,
  normaliseRecurrence,
  labelToMinute,
  endMinuteFromLabel,
  longDateLabel,
  minuteLabel,
  parseDateKey,
  sastToday,
  sastNowMinute,
  slotStarts,
  weekDays,
  weekRangeLabel,
  weekStart,
  type Recurrence,
} from "@/lib/roomBookings";

// The room calendar, ported from the COLAB hub: pick a room, click a slot to
// book it, click a booking to see it, edit or cancel it, or ask whoever holds
// it for the room. Every hour of the day is bookable; the grid opens at 07:00.

interface RoomOption {
  id: string;
  name: string;
  capacity: number;
  color: string;
  notes: string;
}

interface Person {
  id: string;
  name: string;
  /** Only for viewers who may see the user list (view_users / manage_users). */
  email?: string;
}

const SLOTS = slotStarts();
const PX_PER_MIN = 0.9;
const GRID_HEIGHT = DAY_END_MINUTE * PX_PER_MIN;

const FREQUENCIES: { key: Recurrence["frequency"]; label: string }[] = [
  { key: "none", label: tk("Never") },
  { key: "daily", label: tk("Daily") },
  { key: "weekly", label: tk("Weekly") },
  { key: "monthly", label: tk("Monthly") },
];

const inputCls = "border border-gray-300 rounded-lg px-3 py-2 text-sm";
const btnPrimary = "bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50";
const btnGhost = "px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 my-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return text ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{text}</p> : null;
}

function WarnLine({ text }: { text: string }) {
  return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{text}</p>;
}

// --- Repeat editor (the Outlook shape) -----------------------------------------

function RecurrenceEditor({ value, onChange, startDate, t }: { value: Recurrence; onChange: (r: Recurrence) => void; startDate: string; t: T }) {
  const set = (patch: Partial<Recurrence>) => onChange({ ...value, ...patch });
  // Counted in full, so an end date that makes too many is shown, not cut short.
  const occurrences = parseDateKey(startDate) ? recurrenceSize(startDate, value) : 0;
  const unit = value.frequency === "daily" ? t("day(s)") : value.frequency === "weekly" ? t("week(s)") : t("month(s)");
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>{t("Repeat")}</span>
        <select value={value.frequency} onChange={(e) => set({ frequency: e.target.value as Recurrence["frequency"] })} className={inputCls}>
          {FREQUENCIES.map((f) => (
            <option key={f.key} value={f.key}>{t(f.label)}</option>
          ))}
        </select>
        {value.frequency !== "none" && (
          <>
            <span>{t("every")}</span>
            <input type="number" min={1} max={12} value={value.interval} onChange={(e) => set({ interval: Math.min(12, Math.max(1, Math.floor(Number(e.target.value)) || 1)) })} className={`${inputCls} w-20`} />
            <span>{unit}</span>
          </>
        )}
      </div>
      {value.frequency === "weekly" && (
        <div className="flex flex-wrap gap-1.5">
          {DAY_SHORT.map((d, i) => {
            const on = value.weekdays.includes(i);
            return (
              <button
                key={d}
                type="button"
                onClick={() => set({ weekdays: on ? value.weekdays.filter((w) => w !== i) : [...value.weekdays, i] })}
                className={`h-8 w-11 rounded-lg border text-xs font-medium ${on ? "border-primary bg-primary text-white" : "border-gray-300 bg-white text-gray-600"}`}
              >
                {t(d)}
              </button>
            );
          })}
        </div>
      )}
      {value.frequency !== "none" && (
        <div className="flex flex-wrap items-center gap-2">
          <span>{t("Ends")}</span>
          <select value={value.endMode} onChange={(e) => set({ endMode: e.target.value as Recurrence["endMode"] })} className={inputCls}>
            <option value="count">{t("After")}</option>
            <option value="date">{t("On date")}</option>
          </select>
          {value.endMode === "count" ? (
            <>
              <input type="number" min={1} max={MAX_OCCURRENCES} value={value.count} onChange={(e) => set({ count: Math.min(MAX_OCCURRENCES, Math.max(1, Math.floor(Number(e.target.value)) || 1)) })} className={`${inputCls} w-20`} />
              <span>{t("times")}</span>
            </>
          ) : (
            <input type="date" value={value.until} min={startDate} onChange={(e) => set({ until: e.target.value })} className={inputCls} />
          )}
        </div>
      )}
      {value.frequency !== "none" && (
        <p className="text-xs text-gray-500">
          {describeRecurrence(value, t)}: {t("{n} bookings. Every one has to be free, or nothing is booked.", { n: occurrences })}
        </p>
      )}
      {occurrences > MAX_OCCURRENCES && (
        <WarnLine text={t("That repeat makes {n} bookings; the most is {max}. Pick an earlier end date.", { n: occurrences, max: MAX_OCCURRENCES })} />
      )}
    </div>
  );
}

// --- Who the room is for ----------------------------------------------------------

function HolderPicker({ people, excludeId, defaultLabel, value, onChange, t }: { people: Person[]; excludeId: string; defaultLabel: string; value: string; onChange: (id: string) => void; t: T }) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const choices = people.filter((p) => p.id !== excludeId && (!term || p.name.toLowerCase().includes(term) || (p.email ?? "").toLowerCase().includes(term)));
  const chosen = people.find((p) => p.id === value);
  const pill = (on: boolean) => `rounded-full border px-2.5 py-0.5 text-xs font-medium ${on ? "border-primary bg-primary/10 text-primary-dark" : "border-gray-300 text-gray-600"}`;
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">{t("For: {name}", { name: chosen ? chosen.name : defaultLabel })}</p>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={people.some((p) => p.email) ? t("Search by name or email...") : t("Search by name...")} className={`${inputCls} w-full`} />
      <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2">
        <button type="button" onClick={() => onChange("")} className={pill(value === "")}>{defaultLabel}</button>
        {choices.map((p) => (
          <button key={p.id} type="button" title={p.email} onClick={() => onChange(p.id)} className={pill(value === p.id)}>{p.name}</button>
        ))}
      </div>
    </div>
  );
}

// --- Book / edit ---------------------------------------------------------------------

function BookingForm({
  room,
  date,
  startMinute,
  existing,
  people,
  currentUserId,
  onDone,
  onCancel,
  t,
}: {
  room: RoomOption;
  date: string;
  startMinute: number;
  existing?: BookingView;
  people: Person[];
  currentUserId: string;
  onDone: (emailFailed: boolean) => void;
  onCancel: () => void;
  t: T;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [bookingDate, setBookingDate] = useState(existing?.date ?? date);
  const [start, setStart] = useState(minuteLabel(existing?.startMinute ?? startMinute));
  const [end, setEnd] = useState(minuteLabel((existing?.endMinute ?? Math.min(startMinute + SLOT_MINUTES, DAY_END_MINUTE)) % DAY_END_MINUTE));
  const [attendeeCount, setAttendeeCount] = useState(existing?.attendeeCount ?? 1);
  const [bookedForId, setBookedForId] = useState(existing?.bookedForId ?? "");
  const [recurrence, setRecurrence] = useState<Recurrence>(DEFAULT_RECURRENCE);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const startMin = labelToMinute(start) ?? 0;
  const endMin = endMinuteFromLabel(end, startMin) ?? startMin;
  const endsBeforeItStarts = endMin <= startMin;
  const tooShort = !endsBeforeItStarts && endMin - startMin < MIN_DURATION;
  const tooMany = attendeeCount > room.capacity;
  const repeatTooLong = !existing && parseDateKey(bookingDate) !== null && recurrenceSize(bookingDate, normaliseRecurrence(recurrence)) > MAX_OCCURRENCES;

  const submit = async () => {
    setBusy(true);
    setError("");
    const payload = {
      roomId: room.id,
      title,
      date: bookingDate,
      startMinute: startMin,
      endMinute: endMin,
      attendeeCount,
      bookedForId,
      recurrence: existing ? undefined : normaliseRecurrence(recurrence),
      ...(existing ? { currentDate: existing.date } : {}),
    };
    const res = await authFetch(existing ? `/api/bookings/${existing.id}` : "/api/bookings", {
      method: existing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await apiErrorMessage(res, t("Failed")));
      return;
    }
    const data = await res.json().catch(() => ({}));
    onDone(!!data.emailFailed);
  };

  const owner = existing ? existing.bookedById : currentUserId;
  const defaultLabel = existing && existing.bookedById !== currentUserId ? t("{name} (booked it)", { name: existing.bookedByName }) : t("Me");

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg bg-gray-50 px-3 py-2">
        <strong>{room.name}</strong> · {t("seats {n}", { n: room.capacity })}
        {room.notes ? ` · ${room.notes}` : ""}
      </div>
      <label className="block">
        <span className="font-medium">{t("Meeting name")}</span>
        <input value={title} maxLength={120} autoFocus onChange={(e) => setTitle(e.target.value)} className={`${inputCls} mt-1 w-full`} />
      </label>
      <label className="block">
        <span className="font-medium">{t("Date")}</span>
        <input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} className={`${inputCls} mt-1 block`} />
      </label>
      <div className="grid gap-3 grid-cols-2">
        <label className="block">
          <span className="font-medium">{t("Starts")}</span>
          <input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} className={`${inputCls} mt-1 w-full`} />
        </label>
        <label className="block">
          <span className="font-medium">{t("Ends")}</span>
          <input type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} className={`${inputCls} mt-1 w-full`} />
        </label>
      </div>
      {!endsBeforeItStarts && !tooShort && (
        <p className="-mt-2 text-xs text-gray-500">
          {minuteLabel(startMin)} - {minuteLabel(endMin)} · {durationLabel(endMin - startMin, t)}
        </p>
      )}
      <label className="block">
        <span className="font-medium">{t("Number of attendees")}</span>
        <input type="number" min={1} max={room.capacity} value={attendeeCount} onChange={(e) => setAttendeeCount(Math.max(1, Math.floor(Number(e.target.value)) || 1))} className={`${inputCls} mt-1 block w-28`} />
      </label>
      {/* Who it is for is the booker's (or a room manager's) call; the person it is for can change the rest. */}
      {(!existing || existing.canChangeHolder) && (
      <div>
        <span className="font-medium">{t("Who is the room for?")}</span>
        <p className="mb-2 text-xs text-gray-500">
          {existing
            ? t("Change this and the new person is emailed that the meeting is now theirs, and whoever it was for is told it no longer is.")
            : t("Booking for someone else? They are shown as the holder, and you both get the reminder and any request for the room.")}
        </p>
        <HolderPicker people={people} excludeId={owner} defaultLabel={defaultLabel} value={bookedForId} onChange={setBookedForId} t={t} />
      </div>
      )}
      {existing ? (
        existing.recurrence && (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            {t("Part of a repeating booking ({rule}). Changes here apply to this occurrence only.", { rule: describeRecurrence(existing.recurrence, t) })}
          </p>
        )
      ) : (
        <RecurrenceEditor value={recurrence} onChange={setRecurrence} startDate={bookingDate} t={t} />
      )}
      {endsBeforeItStarts && <WarnLine text={t("The end time has to be after the start time.")} />}
      {tooShort && <WarnLine text={t("A meeting has to be at least {n} minutes long.", { n: MIN_DURATION })} />}
      {tooMany && <WarnLine text={t("{room} seats {n}. Pick a bigger room or reduce the headcount.", { room: room.name, n: room.capacity })} />}
      <ErrorLine text={error} />
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={btnGhost}>{t("Cancel")}</button>
        <button type="button" onClick={submit} disabled={busy || !title.trim() || endsBeforeItStarts || tooShort || tooMany || repeatTooLong} className={btnPrimary}>
          {busy ? t("Saving...") : existing ? t("Save changes") : t("Book the room")}
        </button>
      </div>
    </div>
  );
}

// --- Detail, cancel, ask for the room ---------------------------------------------

function BookingDetail({ booking, room, canBook, onEdit, onDone, t }: { booking: BookingView; room: RoomOption; canBook: boolean; onEdit: () => void; onDone: (msg: string, error?: boolean) => void; t: T }) {
  const [asking, setAsking] = useState(false);
  const [ask, setAsk] = useState({ title: "", message: "", attendeeCount: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cancel = async (scope: "one" | "series") => {
    if (!confirm(scope === "series" ? t("Cancel this booking and every later one in the series?") : t("Cancel this booking?"))) return;
    setBusy(true);
    const res = await authFetch(`/api/bookings/${booking.id}?room=${encodeURIComponent(booking.roomId)}&date=${booking.date}&scope=${scope}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setError(await apiErrorMessage(res, t("Failed")));
    const data = await res.json().catch(() => ({}));
    const msg = scope === "series" ? t("{n} bookings cancelled", { n: data.count ?? 0 }) : t("Booking cancelled");
    onDone(data.skipped > 0 ? `${msg} ${t("{n} held by someone else were left alone.", { n: data.skipped })}` : msg);
  };

  const decide = async (approve: boolean) => {
    if (!approve && !confirm(t("Decline this booking? The time is freed and they are emailed."))) return;
    setBusy(true);
    setError("");
    const res = await authFetch(`/api/bookings/${booking.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: booking.roomId, date: booking.date, approve }),
    });
    setBusy(false);
    if (!res.ok) return setError(await apiErrorMessage(res, t("Failed")));
    const data = await res.json().catch(() => ({}));
    const msg = approve ? t("Booking approved") : t("Booking declined");
    onDone(data.emailFailed ? `${msg}. ${t("The email to them didn't send, so let them know.")}` : msg, !!data.emailFailed);
  };

  const sendAsk = async () => {
    setBusy(true);
    setError("");
    const res = await authFetch(`/api/bookings/${booking.id}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: booking.roomId, date: booking.date, ...ask }),
    });
    setBusy(false);
    if (!res.ok) return setError(await apiErrorMessage(res, t("Failed")));
    const data = await res.json().catch(() => ({}));
    onDone(
      data.emailFailed
        ? t("Request saved, but the email didn't send. Tell them in person; they can still answer in the portal.")
        : t("Request sent. The room stays theirs until they say yes."),
      !!data.emailFailed
    );
  };

  const holder = booking.bookedForName ? t("{a} and {b}", { a: booking.bookedForName, b: booking.bookedByName }) : booking.bookedByName;

  if (asking) {
    return (
      <div className="space-y-4 text-sm">
        <p className="rounded-lg bg-gray-50 px-3 py-2">
          {t("You're asking {holder} for {room} on {date} at {time}. They get an email and can agree or decline. The room stays theirs until they say yes.", {
            holder,
            room: room.name,
            date: longDateLabel(booking.date, t),
            time: minuteLabel(booking.startMinute),
          })}
        </p>
        <label className="block">
          <span className="font-medium">{t("What do you need the room for?")}</span>
          <input value={ask.title} maxLength={120} autoFocus onChange={(e) => setAsk({ ...ask, title: e.target.value })} className={`${inputCls} mt-1 w-full`} />
        </label>
        <label className="block">
          <span className="font-medium">{t("Why do you need it?")}</span>
          <textarea value={ask.message} maxLength={1000} rows={3} onChange={(e) => setAsk({ ...ask, message: e.target.value })} className={`${inputCls} mt-1 w-full`} />
          <span className="text-xs text-gray-500">{t("They will see exactly what you write here.")}</span>
        </label>
        <label className="block">
          <span className="font-medium">{t("Number of attendees")}</span>
          <input type="number" min={1} max={room.capacity} value={ask.attendeeCount} onChange={(e) => setAsk({ ...ask, attendeeCount: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} className={`${inputCls} mt-1 block w-28`} />
        </label>
        <ErrorLine text={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setAsking(false)} className={btnGhost}>{t("Back")}</button>
          <button type="button" onClick={sendAsk} disabled={busy || !ask.title.trim() || !ask.message.trim()} className={btnPrimary}>
            {busy ? t("Sending...") : t("Ask for the room")}
          </button>
        </div>
      </div>
    );
  }

  const rows: [string, string][] = [
    [t("Room"), room.name],
    [t("When"), `${longDateLabel(booking.date, t)}, ${minuteLabel(booking.startMinute)} - ${minuteLabel(booking.endMinute)}`],
    ...(booking.bookedForName ? ([[t("Room is for"), booking.bookedForName]] as [string, string][]) : []),
    [t("Booked by"), booking.bookedByName],
    [t("Attendees"), String(booking.attendeeCount)],
    ...(booking.recurrence ? ([[t("Repeats"), describeRecurrence(booking.recurrence, t)]] as [string, string][]) : []),
    ...(booking.guest
      ? ([
          [t("Organisation"), booking.guest.organisation || "-"],
          [t("Email"), booking.guest.email],
          [t("Phone"), booking.guest.phone],
        ] as [string, string][])
      : []),
  ];

  return (
    <div className="space-y-4 text-sm">
      <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3 px-3 py-2">
            <dt className="w-28 shrink-0 text-gray-500">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {booking.pendingApproval && <WarnLine text={t("Booked from the public link. The time is held until a room manager approves or declines it.")} />}
      {booking.pendingRequests > 0 && <WarnLine text={t("{n} outstanding request(s) for this slot.", { n: booking.pendingRequests })} />}
      <ErrorLine text={error} />
      <div className="flex flex-wrap justify-end gap-2">
        {booking.pendingApproval && booking.guest && (
          <>
            <button type="button" disabled={busy} onClick={() => decide(false)} className={`${btnGhost} text-risk-high`}>{t("Decline")}</button>
            <button type="button" disabled={busy} onClick={() => decide(true)} className={btnPrimary}>{t("Approve")}</button>
          </>
        )}
        {booking.canEdit && !booking.pendingApproval && (
          <>
            <button type="button" onClick={onEdit} className={btnGhost}>{t("Edit")}</button>
            {booking.seriesId && (
              <button type="button" disabled={busy} onClick={() => cancel("series")} className={btnGhost}>{t("Cancel series")}</button>
            )}
            <button type="button" disabled={busy} onClick={() => cancel("one")} className={`${btnGhost} text-risk-high`}>{t("Cancel booking")}</button>
          </>
        )}
        {!booking.isMine && !booking.isGuest && canBook &&
          (booking.iAsked ? (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">{t("You've asked for this room")}</span>
          ) : (
            <button type="button" onClick={() => setAsking(true)} className={btnPrimary}>{t("Ask for the room")}</button>
          ))}
      </div>
    </div>
  );
}

// --- The page ----------------------------------------------------------------------

export default function BookingsPage() {
  const t = useT();
  const { session, loading } = useAuth(["book_rooms", "manage_rooms"]);
  const canBook = !!session?.permissions.includes("book_rooms");
  const [rooms, setRooms] = useState<RoomOption[] | null>(null);
  const [roomId, setRoomId] = useState("");
  const [today, setToday] = useState(() => sastToday());
  // Taken once per visit: past slots are greyed out, and the server refuses them anyway.
  const [nowMinute, setNowMinute] = useState(() => sastNowMinute());
  // Kept current on a long-open page: refreshed every minute (in the timer's
  // callback) and whenever a slot is clicked, so past slots grey out.
  const refreshNow = () => {
    setToday(sastToday());
    setNowMinute(sastNowMinute());
  };
  useEffect(() => {
    const timer = setInterval(() => {
      setToday(sastToday());
      setNowMinute(sastNowMinute());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);
  const slotPast = (day: string, m: number) => day < today || (day === today && m + SLOT_MINUTES <= nowMinute);
  const [monday, setMonday] = useState(() => weekStart(sastToday()));
  const [bookings, setBookings] = useState<BookingView[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [newAt, setNewAt] = useState<{ date: string; startMinute: number } | null>(null);
  const [viewing, setViewing] = useState<BookingView | null>(null);
  const [editing, setEditing] = useState<BookingView | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const scrolled = useRef(false);

  const room = rooms?.find((r) => r.id === roomId) ?? rooms?.[0] ?? null;
  const days = useMemo(() => weekDays(monday), [monday]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const res = await authFetch("/api/rooms");
      if (res.ok) setRooms(((await res.json()) as (RoomOption & { active: boolean })[]).filter((r) => r.active));
      const p = await authFetch("/api/bookings/people");
      if (p.ok) setPeople(await p.json());
    })();
  }, [session]);

  const roomKey = room?.id ?? "";
  // Returns the week rather than setting it, so the effect sets state in a
  // callback (react-hooks/set-state-in-effect).
  const fetchWeek = useCallback(async (): Promise<BookingView[] | "error" | null> => {
    if (!roomKey) return null;
    try {
      const res = await authFetch(`/api/bookings?room=${encodeURIComponent(roomKey)}&week=${monday}`);
      return res.ok ? await res.json() : "error";
    } catch {
      return "error";
    }
  }, [roomKey, monday]);
  // Only the newest fetch may land: flicking quickly between rooms or weeks
  // must not let a slow, older answer paint the wrong week. A failed fetch
  // empties the grid and says so, rather than leaving the last week showing.
  const fetchSeq = useRef(0);
  const [weekError, setWeekError] = useState(false);
  const apply = (mine: number) => (b: BookingView[] | "error" | null) => {
    if (b === null || mine !== fetchSeq.current) return;
    setWeekError(b === "error");
    setBookings(b === "error" ? [] : b);
  };
  const loadWeek = () => fetchWeek().then(apply(++fetchSeq.current));

  useEffect(() => {
    fetchWeek().then(apply(++fetchSeq.current));
  }, [fetchWeek]);

  const done = (message: string, error = false) => {
    setNewAt(null);
    setViewing(null);
    setEditing(null);
    setToast({ message, type: error ? "error" : "success" });
    loadWeek();
  };

  // Opens the grid at the start of a working day rather than at midnight.
  const scrollRef = (el: HTMLDivElement | null) => {
    if (el && !scrolled.current) {
      el.scrollTop = SCROLL_TO_MINUTE * PX_PER_MIN;
      scrolled.current = true;
    }
  };

  if (loading || rooms === null) return <div className="p-6">{t("Loading...")}</div>;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">{t("Room Bookings")}</h1>
        <p className="text-gray-500 text-sm">
          {t("Pick a room, then click a slot to book it. If someone already has the slot you need, you can ask them for it.")}
        </p>
      </div>

      {!room ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
          {t("No rooms have been set up yet. Once an admin adds meeting rooms, they can be booked here.")}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <select value={room.id} onChange={(e) => setRoomId(e.target.value)} className={`${inputCls} bg-white max-w-full`}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{t("{name} (seats {n})", { name: r.name, n: r.capacity })}</option>
              ))}
            </select>
            <div className="flex flex-wrap items-center gap-1">
              <button onClick={() => setMonday(addDays(monday, -7))} className={btnGhost} aria-label={t("Previous week")}>&lsaquo;</button>
              <span className="min-w-44 text-center text-sm font-medium">{weekRangeLabel(monday, t)}</span>
              <button onClick={() => setMonday(addDays(monday, 7))} className={btnGhost} aria-label={t("Next week")}>&rsaquo;</button>
              {monday === weekStart(today) ? (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary-dark">{t("This week")}</span>
              ) : (
                <button onClick={() => setMonday(weekStart(today))} className="rounded-lg border border-gray-300 px-3 py-1 text-xs">{t("Back to this week")}</button>
              )}
            </div>
          </div>

          {weekError && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{t("Could not load this week's bookings. Try again.")}</p>}
          <div ref={scrollRef} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto max-h-[70vh]">
            <div className="min-w-[820px]">
              <div className="sticky top-0 z-10 grid grid-cols-[64px_repeat(7,1fr)] border-b border-gray-200 bg-gray-50">
                <div />
                {days.map((d) => (
                  <div key={d} className={`px-2 py-2 text-center text-xs ${d === today ? "font-semibold text-primary-dark" : "text-gray-600"}`}>
                    <div>{dayShortName(d, t)}</div>
                    <div className="text-sm">{parseDateKey(d)?.d}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-[64px_repeat(7,1fr)]">
                <div className="relative border-r border-gray-200" style={{ height: GRID_HEIGHT }}>
                  {SLOTS.map((m) => (
                    <div key={m} className="absolute left-0 w-full pr-1 text-right text-[10px] text-gray-400" style={{ top: m * PX_PER_MIN + 1 }}>
                      {minuteLabel(m)}
                    </div>
                  ))}
                </div>
                {days.map((day) => (
                  <div key={day} className="relative border-r border-gray-200 last:border-r-0" style={{ height: GRID_HEIGHT }}>
                    {SLOTS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={!canBook || slotPast(day, m)}
                        // A slot already under way opens at the next 5 minutes, not at its (past) start.
                        onClick={() => {
                          refreshNow();
                          const nowM = sastNowMinute();
                          const isToday = day === sastToday();
                          setNewAt({ date: day, startMinute: isToday && m < nowM ? Math.min(DAY_END_MINUTE - MIN_DURATION, Math.ceil((nowM + 1) / 5) * 5) : m });
                        }}
                        title={canBook && !slotPast(day, m) ? t("Book {time} on {date}", { time: minuteLabel(m), date: longDateLabel(day, t) }) : undefined}
                        className={`absolute w-full border-b border-gray-100 enabled:hover:bg-primary/5 ${slotPast(day, m) ? "bg-gray-50" : ""}`}
                        style={{ top: m * PX_PER_MIN, height: SLOT_MINUTES * PX_PER_MIN }}
                      />
                    ))}
                    {bookings
                      .filter((b) => b.date === day)
                      .map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setViewing(b)}
                          className="absolute left-0.5 right-0.5 overflow-hidden rounded-md border px-1.5 py-1 text-left hover:shadow-md"
                          style={{
                            top: b.startMinute * PX_PER_MIN,
                            height: Math.max(18, (b.endMinute - b.startMinute) * PX_PER_MIN - 2),
                            backgroundColor: `${room.color}22`,
                            borderColor: `${room.color}77`,
                          }}
                        >
                          <span className="block truncate text-[11px] font-semibold leading-tight text-dark">{b.title}</span>
                          <span className="block truncate text-[10px] leading-tight text-gray-600">
                            {b.bookedForName ?? b.bookedByName} · {t("{n} people", { n: b.attendeeCount })}
                          </span>
                          {(b.recurrence || b.pendingRequests > 0 || b.pendingApproval) && (
                            <span className="block truncate text-[10px] leading-tight text-amber-700">
                              {[b.pendingApproval ? t("Pending approval") : "", b.recurrence ? t("Repeats") : "", b.pendingRequests > 0 ? t("Requested") : ""].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {canBook
              ? t("Click any empty slot to book it. Click a booking to see the detail, or to ask whoever has it if you can take the room.")
              : t("You can see and manage bookings here. Booking a room needs the Book Meeting Rooms permission.")}
          </p>
        </>
      )}

      {room && newAt && (
        <Modal title={t("Book {room}", { room: room.name })} onClose={() => setNewAt(null)}>
          <BookingForm
            room={room}
            date={newAt.date}
            startMinute={newAt.startMinute}
            people={people}
            currentUserId={session?.id ?? ""}
            onCancel={() => setNewAt(null)}
            onDone={(failed) => done(failed ? t("Booked, but the confirmation email couldn't be sent.") : t("Room booked"), failed)}
            t={t}
          />
        </Modal>
      )}
      {room && viewing && (
        <Modal title={viewing.title} onClose={() => setViewing(null)}>
          <BookingDetail
            booking={viewing}
            room={room}
            canBook={canBook}
            onEdit={() => {
              setEditing(viewing);
              setViewing(null);
            }}
            onDone={done}
            t={t}
          />
        </Modal>
      )}
      {room && editing && (
        <Modal title={t("Edit {title}", { title: editing.title })} onClose={() => setEditing(null)}>
          <BookingForm
            room={room}
            date={editing.date}
            startMinute={editing.startMinute}
            existing={editing}
            people={people}
            currentUserId={session?.id ?? ""}
            onCancel={() => setEditing(null)}
            onDone={(failed) => done(failed ? t("Saved, but the handover email couldn't be sent.") : t("Booking updated"), failed)}
            t={t}
          />
        </Modal>
      )}
    </div>
  );
}
