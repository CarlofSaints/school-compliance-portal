"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import Toast from "@/components/Toast";
import { useT } from "@/components/I18nProvider";

// Meeting rooms: name, capacity, colour, notes. Ported from the COLAB hub.
// A room with bookings on record is retired, never deleted, so the calendar
// history of who had what is kept.

interface RoomRow {
  id: string;
  name: string;
  capacity: number;
  color: string;
  notes: string;
  active: boolean;
  hasBookings: boolean;
}

const DEFAULT_COLOR = "#0d9488";
const SWATCHES = ["#0d9488", "#4f46e5", "#db2777", "#ea580c", "#0284c7", "#65a30d"];

export default function RoomsPage() {
  const t = useT();
  const { session, loading } = useAuth("manage_rooms");
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [editing, setEditing] = useState<RoomRow | "new" | null>(null);
  const [form, setForm] = useState({ name: "", capacity: 6, color: DEFAULT_COLOR, notes: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Returns the rooms rather than setting them, so the effect below sets state
  // in a callback (react-hooks/set-state-in-effect).
  const loadRooms = useCallback(async (): Promise<RoomRow[] | null> => {
    const res = await authFetch("/api/rooms?withUsage=1");
    return res.ok ? res.json() : null;
  }, []);
  const fetchRooms = () => loadRooms().then((r) => r && setRooms(r));

  useEffect(() => {
    if (session) loadRooms().then((r) => r && setRooms(r));
  }, [session, loadRooms]);

  const open = (room: RoomRow | "new") => {
    setEditing(room);
    setForm(room === "new" ? { name: "", capacity: 6, color: DEFAULT_COLOR, notes: "" } : { name: room.name, capacity: room.capacity, color: room.color, notes: room.notes });
  };

  const send = async (url: string, method: string, body?: unknown) => {
    const res = await authFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      setToast({ message: await apiErrorMessage(res, t("Failed")), type: "error" });
      return null;
    }
    return res.json();
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const ok = editing === "new"
      ? await send("/api/rooms", "POST", form)
      : await send(`/api/rooms/${editing.id}`, "PUT", form);
    setSaving(false);
    if (ok) {
      setEditing(null);
      // Lowering the capacity is allowed; the manager is told which bookings now exceed it.
      setToast(
        ok.overCapacity > 0
          ? { message: t("Room saved. {n} upcoming booking(s) have more attendees than the room now seats.", { n: ok.overCapacity }), type: "error" }
          : { message: t("Room saved"), type: "success" }
      );
      fetchRooms();
    }
  };

  // A retired room's upcoming bookings are cancelled and their holders emailed.
  const cancelledNotice = (res: { cancelledCount: number; emailFailed?: boolean }) =>
    res.emailFailed
      ? t("{n} upcoming booking(s) cancelled, but some emails to their holders could not be sent.", { n: res.cancelledCount })
      : t("{n} upcoming booking(s) cancelled and their holders emailed.", { n: res.cancelledCount });

  const toggleActive = async (r: RoomRow) => {
    const msg = r.active
      ? t("Retire \"{name}\"? It stops appearing for new bookings. Its upcoming bookings are cancelled and their holders emailed; past ones are kept.", { name: r.name })
      : t("Bring \"{name}\" back for booking?", { name: r.name });
    if (!confirm(msg)) return;
    // Only the flag: sending the whole row could overwrite another manager's edit.
    const ok = await send(`/api/rooms/${r.id}`, "PUT", { active: !r.active });
    if (ok) {
      if (ok.cancelledCount > 0) setToast({ message: cancelledNotice(ok), type: ok.emailFailed ? "error" : "success" });
      fetchRooms();
    }
  };

  const remove = async (r: RoomRow) => {
    const msg = r.hasBookings
      ? t("\"{name}\" has bookings on record, so it can't be deleted. It will be retired instead, keeping the calendar history. Carry on?", { name: r.name })
      : t("Delete \"{name}\"? It has never been booked, so it will be removed completely.", { name: r.name });
    if (!confirm(msg)) return;
    const res = await send(`/api/rooms/${r.id}`, "DELETE");
    if (res) {
      setToast({
        message: res.retired
          ? `${t("{name} has bookings on record, so it was retired instead of deleted.", { name: r.name })}${res.cancelledCount > 0 ? ` ${cancelledNotice(res)}` : ""}`
          : t("Room deleted"),
        type: res.emailFailed ? "error" : "success",
      });
      fetchRooms();
    }
  };

  if (loading) return <div className="p-6">{t("Loading...")}</div>;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Meeting Rooms")}</h1>
          <p className="text-gray-500 text-sm">{t("The rooms people can book on the calendar")}</p>
        </div>
        <button
          onClick={() => open("new")}
          className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {t("+ Add room")}
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
          {t("No rooms yet. Add your meeting rooms and people can start booking them.")}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
          {rooms.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-8 w-8 shrink-0 rounded-lg border" style={{ backgroundColor: `${r.color}22`, borderColor: `${r.color}66` }} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-dark">{r.name}</span>
                    <span className="text-xs text-gray-500">{t("seats {n}", { n: r.capacity })}</span>
                    {!r.active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{t("Retired")}</span>}
                  </div>
                  {r.notes && <p className="truncate text-xs text-gray-500">{r.notes}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <button onClick={() => open(r)} className="text-primary hover:underline">{t("Edit")}</button>
                <button onClick={() => toggleActive(r)} className="text-gray-600 hover:underline">
                  {r.active ? t("Retire") : t("Bring back")}
                </button>
                <button onClick={() => remove(r)} className="text-risk-high hover:underline">{t("Delete")}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold">{editing === "new" ? t("Add meeting room") : t("Edit {name}", { name: editing.name })}</h3>
            <label className="block text-sm">
              <span className="font-medium">{t("Room name")}</span>
              <input
                value={form.name}
                maxLength={60}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("Max capacity")}</span>
              <input
                type="number"
                min={1}
                max={500}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Math.floor(Number(e.target.value)) || 1 })}
                className="mt-1 w-32 border border-gray-300 rounded-lg px-3 py-2"
              />
              <span className="mt-1 block text-xs text-gray-500">{t("Nobody can book this room for more people than it seats.")}</span>
            </label>
            <div className="text-sm">
              <span className="font-medium">{t("Colour")}</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-gray-300 bg-white p-1"
                  aria-label={t("Room colour")}
                />
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    aria-label={c}
                    className="h-6 w-6 rounded-full border-2"
                    style={{ backgroundColor: c, borderColor: form.color === c ? "#0f172a" : "transparent" }}
                  />
                ))}
              </div>
              <span className="mt-1 block text-xs text-gray-500">{t("How this room's bookings are tinted on the calendar.")}</span>
            </div>
            <label className="block text-sm">
              <span className="font-medium">{t("Notes")}</span>
              <textarea
                value={form.notes}
                maxLength={300}
                rows={2}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder={t("Optional: a projector, a whiteboard, whatever is worth knowing.")}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-600">{t("Cancel")}</button>
              <button
                onClick={save}
                disabled={saving || !form.name.trim()}
                className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {saving ? t("Saving...") : editing === "new" ? t("Add room") : t("Save changes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
