"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RoleFilter from "@/components/RoleFilter";
import Toast from "@/components/Toast";
import { useT } from "@/components/I18nProvider";
import { downloadWithAuth } from "@/lib/download";
import { parseWorkbook } from "@/lib/spendImportSheet";
import { TYPE_LABELS, rowsFromGrid, type StaffDetails, type StaffRow, type StaffType } from "@/lib/staff";
import { apiErrorMessage, authFetch, useAuth } from "@/lib/useAuth";

interface Member {
  id: string;
  name: string;
  surname: string;
  email: string;
  role: string;
  roleName: string;
  staff: StaffDetails;
  waiting: boolean;
}
interface Result {
  row: number;
  name: string;
  email: string;
  action: "add" | "update";
  problems: string[];
  roleMissing: boolean;
}
type Skipped = Pick<Result, "row" | "name" | "problems" | "roleMissing">;

const EMPTY: StaffRow = { staffNumber: "", email: "", name: "", surname: "", role: "", type: "", sace: "", persal: "", subject: "", grade: "" };
const INPUT = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none disabled:bg-gray-50 disabled:text-gray-500";

function Problems({ items }: { items: Skipped[] }) {
  const t = useT();
  return (
    <>
      <ul className="text-sm text-amber-900 space-y-1">
        {items.map((r) => (
          <li key={r.row}>
            <strong>{t("Row {row}", { row: r.row })}, {r.name}:</strong> {r.problems.join(" ")}
          </li>
        ))}
      </ul>
      {items.some((r) => r.roleMissing) && (
        <a href="/admin/roles" className="inline-block mt-2 text-sm text-primary font-medium hover:underline">
          {t("Add the missing role on the Roles page")}
        </a>
      )}
    </>
  );
}

export default function StaffPage() {
  const t = useT();
  const { session, loading } = useAuth("manage_users");
  const [staff, setStaff] = useState<Member[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [form, setForm] = useState<StaffRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ fileName: string; rows: StaffRow[]; results: Result[] } | null>(null);
  const [ignoreInvalid, setIgnoreInvalid] = useState(false);
  const [skipped, setSkipped] = useState<Skipped[]>([]);

  const fetchData = useCallback(async () => {
    const res = await authFetch("/api/staff", { cache: "no-store" });
    if (!res.ok) return setToast({ message: await apiErrorMessage(res), type: "error" });
    const data = await res.json();
    setStaff(data.staff);
    setRoles(data.roles);
  }, []);
  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  const post = (body: object) => authFetch("/api/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const pickFile = async (f: File) => {
    setSkipped([]);
    setIgnoreInvalid(false);
    setUpload(null);
    try {
      const { sheetNames, sheets } = await parseWorkbook(await f.arrayBuffer());
      const { rows, missing } = rowsFromGrid(sheets[sheetNames[0]] || []);
      if (missing.length) return setToast({ message: t("These columns are missing from the file: {columns}. Download the template and use that.", { columns: missing.join(", ") }), type: "error" });
      if (!rows.length) return setToast({ message: t("There is nobody in that file."), type: "error" });
      const res = await post({ rows, check: true });
      if (!res.ok) return setToast({ message: await apiErrorMessage(res), type: "error" });
      setUpload({ fileName: f.name, rows, results: (await res.json()).results });
    } catch {
      setToast({ message: t("Could not read that file. Save it as .xlsx or .csv and try again."), type: "error" });
    }
  };

  const loadFile = async () => {
    if (!upload) return;
    setSaving(true);
    const res = await post({ rows: upload.rows, ignoreInvalid }).finally(() => setSaving(false));
    if (!res.ok) return setToast({ message: await apiErrorMessage(res), type: "error" });
    const data = await res.json();
    setUpload(null);
    setSkipped(data.skipped);
    setToast({ message: t("{added} added, {updated} updated, {skipped} skipped", { added: data.added, updated: data.updated, skipped: data.skipped.length }), type: data.skipped.length ? "error" : "success" });
    fetchData();
  };

  const saveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    const res = await post({ rows: [form] }).finally(() => setSaving(false));
    if (res.ok) {
      setForm(null);
      setToast({ message: t("Staff member saved"), type: "success" });
      return fetchData();
    }
    const data = await res.json().catch(() => null);
    setToast({ message: data?.results?.[0]?.problems?.join(" ") || data?.error || t("Could not save."), type: "error" });
  };

  const openEdit = (m: Member) => {
    setEditing(true);
    setForm({ ...m.staff, email: m.email, name: m.name, surname: m.surname, role: m.roleName, type: TYPE_LABELS[m.staff.type] });
  };

  const waiting = staff.filter((m) => m.waiting).length;
  const sendLinks = async () => {
    if (!confirm(t("Email {count} staff a link to set their password? The link lasts one hour. After that they use Forgot your password? on the sign-in page.", { count: waiting }))) return;
    setSending(true);
    const res = await authFetch("/api/staff/invite", { method: "POST" }).finally(() => setSending(false));
    if (!res.ok) return setToast({ message: await apiErrorMessage(res), type: "error" });
    const data = await res.json();
    setToast({ message: t("{sent} sent, {failed} failed, {left} still to send", { sent: data.sent, failed: data.failed.length, left: data.left }), type: data.failed.length ? "error" : "success" });
    fetchData();
  };

  if (loading) return <div className="p-6">{t("Loading...")}</div>;

  const problems = upload?.results.filter((r) => r.problems.length) ?? [];
  const ready = upload ? upload.results.length - problems.length : 0;
  const updates = upload?.results.filter((r) => r.action === "update" && !r.problems.length) ?? [];
  const roleNames = [...new Set(staff.map((m) => m.roleName))].sort();
  const shown = staff.filter((m) => !roleFilter || m.roleName === roleFilter);
  const field = (key: keyof StaffRow, label: string, required = false, locked = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        value={form?.[key] ?? ""}
        onChange={(e) => form && setForm({ ...form, [key]: e.target.value })}
        required={required}
        disabled={locked}
        type={key === "email" ? "email" : "text"}
        autoComplete="off"
        className={INPUT}
      />
    </div>
  );

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Staff")}</h1>
          <p className="text-gray-500 text-sm">{t("Teachers and coaches. Each one is a user and appears on the People page.")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {waiting > 0 && (
            <button onClick={sendLinks} disabled={sending} className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              {sending ? t("Sending...") : t("Email login links ({count})", { count: waiting })}
            </button>
          )}
          <button
            onClick={async () => {
              const result = await downloadWithAuth("/api/staff/template", "Staff template.xlsx");
              if (!result.ok) setToast({ message: result.error || t("Could not save."), type: "error" });
            }}
            className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            {t("Download template")}
          </button>
          <button onClick={() => file.current?.click()} className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            {t("Upload Excel")}
          </button>
          <input
            ref={file}
            type="file"
            accept=".xlsx,.xls,.csv"
            aria-label={t("Upload Excel")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) pickFile(f);
            }}
          />
          <button
            onClick={() => {
              setEditing(false);
              setForm(EMPTY);
            }}
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {t("+ Add staff member")}
          </button>
        </div>
      </div>

      {upload && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm font-medium text-dark">{upload.fileName}</p>
          <p className="text-sm text-gray-600 mb-3">{t("{ready} ready to load, {bad} with something wrong", { ready, bad: problems.length })}</p>
          {updates.length > 0 && (
            <p className="text-sm text-gray-600 mb-3">
              {t("Already have a login, so only their staff details change: {names}", { names: updates.map((r) => r.name).join(", ") })}
            </p>
          )}
          {problems.length > 0 && (
            <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <Problems items={problems} />
              <label className="flex items-center gap-2 text-sm mt-3">
                <input type="checkbox" checked={ignoreInvalid} onChange={(e) => setIgnoreInvalid(e.target.checked)} className="accent-primary" />
                {t("Ignore invalid items")}
              </label>
              <p className="text-xs text-gray-500 mt-1">{t("The rows above are left out. Everyone else loads.")}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={loadFile} disabled={saving || !ready || (problems.length > 0 && !ignoreInvalid)} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? t("Loading...") : t("Load {count} people", { count: ready })}
            </button>
            <button onClick={() => setUpload(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}

      {skipped.length > 0 && (
        <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4">
          <div className="flex justify-between gap-4 mb-2">
            <p className="text-sm font-medium text-amber-900">{t("These rows were not loaded. Fix them and upload the file again.")}</p>
            <button onClick={() => setSkipped([])} className="text-xs text-gray-500 hover:text-gray-700">
              {t("Close")}
            </button>
          </div>
          <Problems items={skipped} />
        </div>
      )}

      <RoleFilter names={roleNames} value={roleFilter} onChange={setRoleFilter} />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {[t("Name"), t("Email"), t("Role"), t("Staff type"), t("Staff number"), t("SACE number"), t("Persal number"), t("Subject"), t("Grade"), ""].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium whitespace-nowrap">{m.name} {m.surname}</td>
                <td className="px-4 py-3 text-gray-600">{m.email}</td>
                <td className="px-4 py-3">{m.roleName}</td>
                <td className="px-4 py-3 whitespace-nowrap">{t(TYPE_LABELS[m.staff.type])}</td>
                <td className="px-4 py-3">{m.staff.staffNumber || "-"}</td>
                <td className="px-4 py-3">{m.staff.sace || "-"}</td>
                <td className="px-4 py-3">{m.staff.persal || "-"}</td>
                <td className="px-4 py-3">{m.staff.subject || "-"}</td>
                <td className="px-4 py-3">{m.staff.grade || "-"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(m)} className="text-primary hover:text-primary-dark text-xs font-medium">{t("Edit")}</button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-gray-400">{t("No staff yet.")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">{editing ? t("Edit staff member") : t("Add staff member")}</h2>
            </div>
            <form onSubmit={saveForm} autoComplete="off" className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {field("name", t("Name"), true, editing)}
                {field("surname", t("Surname"), true, editing)}
              </div>
              {field("email", t("Email"), true, editing)}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("Role")}</label>
                {editing ? (
                  <input value={form.role} disabled aria-label={t("Role")} className={INPUT} />
                ) : (
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} required className={INPUT}>
                    <option value="">{t("Choose a role")}</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                )}
                {editing ? (
                  <p className="text-xs text-gray-400 mt-1">{t("Change the name, email or role on the Users page.")}</p>
                ) : (
                  <a href="/admin/roles" className="text-xs text-primary hover:underline">{t("Role not listed? Add it on the Roles page")}</a>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("Staff type")}</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required className={INPUT}>
                  <option value="">{t("Choose one")}</option>
                  {(Object.keys(TYPE_LABELS) as StaffType[]).map((k) => (
                    <option key={k} value={TYPE_LABELS[k]}>{t(TYPE_LABELS[k])}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">{t("Choose Coach only for someone who does not teach. A coach who also teaches is a teacher.")}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {field("staffNumber", t("Staff number (optional)"))}
                {field("sace", form.type === TYPE_LABELS.coach ? t("SACE number (optional)") : t("SACE number"), form.type !== TYPE_LABELS.coach)}
              </div>
              {field("persal", form.type === TYPE_LABELS.state ? t("Persal number") : t("Persal number (optional)"), form.type === TYPE_LABELS.state)}
              {field("subject", t("Subject, or what they coach"))}
              {field("grade", t("Grade"))}
              <p className="text-xs text-gray-400">{t("Put a comma between each subject or grade. Leave Grade blank for a coach.")}</p>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="flex-1 bg-primary hover:bg-primary-dark text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? t("Saving...") : t("Save")}
                </button>
                <button type="button" onClick={() => setForm(null)} className="px-6 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">
                  {t("Cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
