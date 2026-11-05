"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import { useTableSort } from "@/lib/useTable";
import Toast from "@/components/Toast";
import FileUpload from "@/components/FileUpload";
import SortableTh from "@/components/SortableTh";
import { useT } from "@/components/I18nProvider";
import { NO_PROOF, type Contact, type ContactType } from "@/lib/payments";

// The list every invoice and bank payment is checked against.

const EMPTY = {
  type: "" as ContactType | "",
  name: "",
  regNumber: "",
  bank: { bankName: "", accountHolder: "", accountNumber: "", branchCode: "", accountType: "" },
  address: "",
  vatNumber: "",
  personName: "",
  personEmail: "",
  personCell: "",
  services: "",
};

const input = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary";

export default function ContactsPage() {
  const t = useT();
  const { session, loading } = useAuth("manage_payments");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [proof, setProof] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const { sortKey, sortDir, toggle, sort } = useTableSort<Contact>("name");

  const load = useCallback(async (): Promise<Contact[] | null> => {
    const res = await authFetch("/api/payments/contacts");
    return res.ok ? res.json() : null;
  }, []);

  useEffect(() => {
    if (session) load().then((c) => c && setContacts(c));
  }, [session, load]);

  const open = (c: Contact | "new") => {
    setEditing(c);
    setProof(null);
    setForm(c === "new" ? EMPTY : { ...EMPTY, ...c, bank: c.bank ?? EMPTY.bank });
  };

  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));
  const setBank = (patch: Partial<typeof EMPTY.bank>) => setForm((f) => ({ ...f, bank: { ...f.bank, ...patch } }));

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const body = new FormData();
    body.set("contact", JSON.stringify(form));
    if (proof) body.set("file", proof);
    const res = await authFetch(editing === "new" ? "/api/payments/contacts" : `/api/payments/contacts/${editing.id}`, {
      method: editing === "new" ? "POST" : "PUT",
      body,
    });
    setSaving(false);
    if (!res.ok) {
      setToast({ message: await apiErrorMessage(res, t("Failed")), type: "error" });
      return;
    }
    setEditing(null);
    setToast({ message: t("Contact saved"), type: "success" });
    load().then((c) => c && setContacts(c));
  };

  const remove = async (c: Contact) => {
    if (!confirm(t("Delete \"{name}\"? Invoices from them will show a grey question mark.", { name: c.name }))) return;
    const res = await authFetch(`/api/payments/contacts/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      setToast({ message: await apiErrorMessage(res, t("Failed")), type: "error" });
      return;
    }
    setContacts((list) => list.filter((x) => x.id !== c.id));
  };

  const th = { activeKey: sortKey, dir: sortDir, onSort: (k: string) => toggle(k) };
  const rows = sort(contacts, (c, k) => (k === "type" ? c.type : k === "person" ? c.personName : k === "services" ? c.services : c.name));
  const creditor = form.type === "creditor";
  const needed = (label: string, required = true) => (
    <>
      {label}
      {required && <span className="text-red-600"> *</span>}
    </>
  );
  const label = "block text-sm font-medium text-gray-700 mb-1";

  if (loading) return <div className="p-6">{t("Loading...")}</div>;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Contacts")}</h1>
          <p className="text-gray-500 text-sm">{t("Creditors and debtors. Invoices and bank payments are checked against this list.")}</p>
        </div>
        <button onClick={() => open("new")} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          {t("Add a contact")}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <SortableTh label={t("Name")} sortKey="name" {...th} />
              <SortableTh label={t("Type")} sortKey="type" {...th} />
              <th className="px-4 py-3 font-medium">{t("Bank details")}</th>
              <SortableTh label={t("Contact person")} sortKey="person" {...th} />
              <SortableTh label={t("Supplies")} sortKey="services" {...th} />
              <th className="px-4 py-3 font-medium">{t("Proof")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3 font-medium text-dark">{c.name}</td>
                <td className="px-4 py-3">{c.type === "creditor" ? t("Creditor") : t("Debtor")}</td>
                <td className="px-4 py-3">{c.bank ? `${c.bank.bankName} ...${c.bank.accountNumber.slice(-4)}` : "-"}</td>
                <td className="px-4 py-3">{c.personName || "-"}</td>
                <td className="px-4 py-3">{c.services || "-"}</td>
                <td className="px-4 py-3">
                  {c.proof ? (
                    <a href={`/api/payments/files/proof/${c.id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {t("View")}
                    </a>
                  ) : c.type === "creditor" ? (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">{t(NO_PROOF)}</span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => open(c)} className="text-primary hover:underline mr-3">{t("Edit")}</button>
                  <button onClick={() => remove(c)} className="text-red-600 hover:underline">{t("Delete")}</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">{t("No contacts yet. Add your first one.")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-dark mb-4">{editing === "new" ? t("Add a contact") : t("Edit contact")}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="c-type" className={label}>{needed(t("Creditor or debtor"))}</label>
                <select id="c-type" className={input} value={form.type} onChange={(e) => set({ type: e.target.value as ContactType })}>
                  <option value="">{t("Choose...")}</option>
                  <option value="creditor">{t("Creditor")}</option>
                  <option value="debtor">{t("Debtor")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="c-name" className={label}>{needed(t("Name of contact"))}</label>
                <input id="c-name" className={input} value={form.name} onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div>
                <label htmlFor="c-reg" className={label}>{t("Company registration number")}</label>
                <input id="c-reg" className={input} value={form.regNumber} onChange={(e) => set({ regNumber: e.target.value })} />
              </div>
              <div>
                <label htmlFor="c-vat" className={label}>{t("VAT number")}</label>
                <input id="c-vat" className={input} value={form.vatNumber} onChange={(e) => set({ vatNumber: e.target.value })} />
              </div>

              <h3 className="sm:col-span-2 text-sm font-semibold text-dark mt-2">{t("Bank details")}</h3>
              <div>
                <label htmlFor="c-bank" className={label}>{needed(t("Bank"), creditor)}</label>
                <input id="c-bank" className={input} value={form.bank.bankName} onChange={(e) => setBank({ bankName: e.target.value })} />
              </div>
              <div>
                <label htmlFor="c-holder" className={label}>{needed(t("Account holder"), creditor)}</label>
                <input id="c-holder" className={input} value={form.bank.accountHolder} onChange={(e) => setBank({ accountHolder: e.target.value })} />
              </div>
              <div>
                <label htmlFor="c-account" className={label}>{needed(t("Account number"), creditor)}</label>
                <input id="c-account" inputMode="numeric" autoComplete="off" className={input} value={form.bank.accountNumber} onChange={(e) => setBank({ accountNumber: e.target.value })} />
              </div>
              <div>
                <label htmlFor="c-branch" className={label}>{needed(t("Branch code"), creditor)}</label>
                <input id="c-branch" inputMode="numeric" autoComplete="off" className={input} value={form.bank.branchCode} onChange={(e) => setBank({ branchCode: e.target.value })} />
              </div>
              <div>
                <label htmlFor="c-acctype" className={label}>{t("Account type")}</label>
                <input id="c-acctype" className={input} value={form.bank.accountType} onChange={(e) => setBank({ accountType: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <p className={label}>{t("Proof of bank details")}</p>
                <FileUpload accept=".pdf,.png,.jpg,.jpeg,.webp" label={t("Upload proof of bank details")} value={proof} onChange={setProof} />
                {editing !== "new" && editing.proof && (
                  <p className="text-xs text-gray-500 mt-1">{t("On file: {name}. If the account changes, this proof is removed.", { name: editing.proof.filename })}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="c-address" className={label}>{t("Address")}</label>
                <textarea id="c-address" rows={2} className={input} value={form.address} onChange={(e) => set({ address: e.target.value })} />
              </div>
              <div>
                <label htmlFor="c-person" className={label}>{t("Contact person name")}</label>
                <input id="c-person" className={input} value={form.personName} onChange={(e) => set({ personName: e.target.value })} />
              </div>
              <div>
                <label htmlFor="c-email" className={label}>{t("Contact person email")}</label>
                <input id="c-email" type="email" className={input} value={form.personEmail} onChange={(e) => set({ personEmail: e.target.value })} />
              </div>
              <div>
                <label htmlFor="c-cell" className={label}>{t("Contact person cell")}</label>
                <input id="c-cell" type="tel" className={input} value={form.personCell} onChange={(e) => set({ personCell: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="c-services" className={label}>{t("Description of services or products")}</label>
                <input id="c-services" className={input} value={form.services} onChange={(e) => set({ services: e.target.value })} />
                <p className="text-xs text-gray-500 mt-1">{t("What does this supplier supply to the school? Example: software, groceries, garden service")}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">{t("Cancel")}</button>
              <button onClick={save} disabled={saving} className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                {saving ? t("Saving...") : t("Save contact")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
