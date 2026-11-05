"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import { useTableSort } from "@/lib/useTable";
import Toast from "@/components/Toast";
import FileUpload from "@/components/FileUpload";
import SortableTh from "@/components/SortableTh";
import SignaturePad from "@/components/SignaturePad";
import DownloadLink from "@/components/DownloadLink";
import { useT } from "@/components/I18nProvider";
import { CHECK_HOVER, PAID_UNSIGNED, STATUS_HOVER, STATUS_LABELS, type Check, type InboxRow, type InvoiceStatus, type UnmatchedLine } from "@/lib/payments";

// The invoice inbox. Files go up one at a time (a request is capped at 4.5 MB)
// and three at once, so a month-end batch does not take all morning.

interface Inbox {
  rows: InboxRow[];
  unmatched: UnmatchedLine[];
  screens: { id: string; filename: string; loadedAt: string; payments: number; statement: boolean }[];
  canSign: boolean;
  signersChosen: boolean;
  balance: number;
  canSpend: boolean;
}

interface Result {
  key: number;
  name: string;
  error: string;
  done: boolean;
}

interface Signature {
  name: string;
  at: string;
  dataUrl: string;
  override: boolean;
}

const AT_ONCE = 3;
const STATUS_ORDER = Object.keys(STATUS_LABELS) as InvoiceStatus[];
const STATUS_LOOK: Record<InvoiceStatus, string> = {
  pending_approval: "bg-gray-100 text-gray-600",
  pending_signatures: "bg-amber-50 text-amber-700",
  signed_one: "bg-blue-50 text-blue-700",
  signed_all: "bg-blue-100 text-blue-800",
  released_one: "bg-indigo-50 text-indigo-700",
  released_all: "bg-indigo-100 text-indigo-800",
  paid: "bg-green-100 text-green-800",
};
const rand = (n: number | null) =>
  n === null ? "-" : `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CheckIcon({ check }: { check: Check }) {
  const t = useT();
  const hover = check.detail ? `${t(CHECK_HOVER[check.code])} (${check.detail})` : t(CHECK_HOVER[check.code]);
  const look =
    check.status === "match"
      ? { mark: "✓", cls: "bg-green-100 text-green-700" }
      : check.status === "mismatch"
        ? { mark: "✕", cls: "bg-red-100 text-red-700" }
        : { mark: "?", cls: "bg-gray-100 text-gray-500" };
  return (
    <span title={hover} aria-label={hover} role="img" className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold cursor-help ${look.cls}`}>
      {look.mark}
    </span>
  );
}

export default function InvoiceInboxPage() {
  const t = useT();
  const { session, loading } = useAuth(["view_payments", "manage_payments"]);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [signing, setSigning] = useState<InboxRow | null>(null);
  const [mark, setMark] = useState<{ dataUrl: string; kind: "drawn" | "typed" } | null>(null);
  const [override, setOverride] = useState(false);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [busy, setBusy] = useState(false);
  const [signerSettings, setSignerSettings] = useState<{ signerTagIds: string[]; tags: { id: string; name: string }[] } | null>(null);
  const { sortKey, sortDir, toggle, sort } = useTableSort<InboxRow>("loadedAt", "desc");

  const manage = !!session?.permissions.includes("manage_payments");
  const manageSigners = !!session?.permissions.includes("manage_approval_settings");

  const fetchInbox = useCallback(async (): Promise<Inbox | null> => {
    const res = await authFetch("/api/payments/invoices");
    return res.ok ? res.json() : null;
  }, []);
  const refresh = useCallback(() => fetchInbox().then((b) => b && setInbox(b)), [fetchInbox]);

  useEffect(() => {
    if (session) fetchInbox().then((b) => b && setInbox(b));
  }, [session, fetchInbox]);

  useEffect(() => {
    if (manageSigners) authFetch("/api/payments/settings").then((r) => (r.ok ? r.json() : null)).then((s) => s && setSignerSettings(s));
  }, [manageSigners]);

  // --- Loading files ----------------------------------------------------------
  const nextKey = useRef(0);
  const waiting = useRef<(() => Promise<void>)[]>([]);
  const running = useRef(0);

  const pump = useCallback(() => {
    while (running.current < AT_ONCE && waiting.current.length) {
      running.current++;
      (async () => {
        for (let job = waiting.current.shift(); job; job = waiting.current.shift()) await job();
        running.current--;
      })();
    }
  }, []);

  const send = useCallback(
    (file: File, url: string) => {
      const key = nextKey.current++;
      setResults((r) => [...r, { key, name: file.name, error: "", done: false }]);
      waiting.current.push(async () => {
        const body = new FormData();
        body.set("file", file);
        let error = "";
        try {
          const res = await authFetch(url, { method: "POST", body });
          if (!res.ok) error = await apiErrorMessage(res, t("Failed"));
        } catch {
          error = t("Could not reach the server. Check your connection and try again.");
        }
        setResults((r) => r.map((x) => (x.key === key ? { ...x, error, done: true } : x)));
        await refresh().catch(() => null);
      });
      pump();
    },
    [pump, refresh, t]
  );

  // Paste a screenshot anywhere on the page.
  useEffect(() => {
    if (!manage) return;
    const onPaste = (e: ClipboardEvent) => {
      const picture = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (picture) send(picture, "/api/payments/screens");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [manage, send]);

  // --- Row actions --------------------------------------------------------------
  const removeInvoice = async (r: InboxRow) => {
    if (!confirm(t("Delete {name} from the inbox?", { name: r.filename }))) return;
    const res = await authFetch(`/api/payments/invoices/${r.id}`, { method: "DELETE" });
    if (!res.ok) setToast({ message: await apiErrorMessage(res, t("Failed")), type: "error" });
    refresh();
  };

  const removeScreen = async (id: string, name: string) => {
    if (!confirm(t("Remove {name} and its payments from the checks?", { name }))) return;
    const res = await authFetch(`/api/payments/screens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) setToast({ message: await apiErrorMessage(res, t("Failed")), type: "error" });
    refresh();
  };

  const openSign = async (r: InboxRow) => {
    setSigning(r);
    setMark(null);
    setOverride(false);
    setSignatures([]);
    const res = await authFetch(`/api/payments/invoices/${r.id}/sign`);
    if (res.ok) setSignatures(await res.json());
  };

  const sign = async () => {
    if (!signing || !mark) return;
    setBusy(true);
    const res = await authFetch(`/api/payments/invoices/${signing.id}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...mark, override }),
    });
    setBusy(false);
    if (!res.ok) {
      setToast({ message: await apiErrorMessage(res, t("Failed")), type: "error" });
      return;
    }
    setSigning(null);
    setToast({ message: t("Signed"), type: "success" });
    refresh();
  };

  const setReleased = async (r: InboxRow, released: boolean) => {
    const res = await authFetch(`/api/payments/invoices/${r.id}/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ released }),
    });
    if (!res.ok) setToast({ message: await apiErrorMessage(res, t("Failed")), type: "error" });
    refresh();
  };

  const saveSigners = async (signerTagIds: string[]) => {
    if (!signerSettings) return;
    setSignerSettings({ ...signerSettings, signerTagIds });
    const res = await authFetch("/api/payments/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signerTagIds }),
    });
    if (!res.ok) setToast({ message: await apiErrorMessage(res, t("Failed")), type: "error" });
    refresh();
  };

  if (loading) return <div className="p-6">{t("Loading...")}</div>;

  const th = { activeKey: sortKey, dir: sortDir, onSort: (k: string) => toggle(k) };
  const rows = sort(inbox?.rows ?? [], (r, k) => {
    if (k === "amountDue" || k === "delta") return r[k];
    if (k === "bank" || k === "amount") return r[k].status;
    if (k === "status") return STATUS_ORDER.indexOf(r.status);
    return String(r[k as keyof InboxRow] ?? "");
  });
  const red = !!signing && (signing.bank.status === "mismatch" || signing.amount.status === "mismatch");
  const mine = !!signing && signing.signedBy.some((s) => s.userId === session?.id);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Invoice Inbox")}</h1>
          <p className="text-gray-500 text-sm">{t("Check invoices against your contacts and the bank payment before anyone authorises it.")}</p>
        </div>
        {manage && (
          <Link href="/payments/contacts" className="border border-gray-200 hover:border-primary text-dark px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            {t("Contacts")}
          </Link>
        )}
      </div>

      {inbox && !inbox.signersChosen && (
        <p className="bg-amber-50 text-amber-800 text-sm rounded-lg px-4 py-3 mb-4">{t("Nobody can sign invoices yet. An administrator must choose the tags who sign.")}</p>
      )}

      {manage && (
        <>
          <div className="grid md:grid-cols-3 gap-4 mb-2">
            <div>
              <h2 className="text-sm font-semibold text-dark mb-2">{t("1. Load invoices")}</h2>
              <FileUpload multiple accept=".pdf,.png,.jpg,.jpeg,.webp" label={t("Drop one or many invoices here")} onChange={(f) => send(f, "/api/payments/invoices")} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-dark mb-2">{t("2. Load the bank screen")}</h2>
              <FileUpload multiple accept=".png,.jpg,.jpeg,.webp,.pdf" label={t("Drop a screenshot here, or paste it with Ctrl+V")} onChange={(f) => send(f, "/api/payments/screens")} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-dark mb-2">{t("3. Load the bank statement")}</h2>
              <FileUpload multiple accept=".pdf,.png,.jpg,.jpeg,.webp" label={t("Drop a statement here to mark what was paid")} onChange={(f) => send(f, "/api/payments/screens?kind=statement")} />
            </div>
          </div>
          {inbox && (
            <p className="text-xs text-gray-500 mb-4">
              {t("Reading a file uses a small amount of your school's credits. Balance: {balance}.", { balance: inbox.balance })}{" "}
              {!inbox.canSpend && <span className="text-red-600">{t("You cannot load files until an administrator ticks \"Can spend translation credits\" for you on Admin > Users.")}</span>}
            </p>
          )}
          {results.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <ul className="text-sm space-y-1">
                {results.map((r) => (
                  <li key={r.key}>
                    <span className="font-medium">{r.name}</span>{" "}
                    {!r.done ? <span className="text-gray-500">{t("Reading...")}</span> : r.error ? <span className="text-red-600">{r.error}</span> : <span className="text-green-700">{t("Loaded")}</span>}
                  </li>
                ))}
              </ul>
              <button onClick={() => setResults((list) => list.filter((r) => !r.done))} className="text-xs text-primary hover:underline mt-2">{t("Clear this list")}</button>
            </div>
          )}
        </>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <SortableTh label={t("Invoice")} sortKey="filename" {...th} />
              <SortableTh label={t("Status")} sortKey="status" {...th} />
              <SortableTh label={t("Supplier")} sortKey="supplierName" {...th} />
              <SortableTh label={t("Amount Due")} sortKey="amountDue" align="right" {...th} />
              <SortableTh label={t("Invoice Date")} sortKey="invoiceDate" {...th} />
              <SortableTh label={t("Bank Details Match")} sortKey="bank" align="center" {...th} />
              <SortableTh label={t("Amount Match")} sortKey="amount" align="center" {...th} />
              <SortableTh label={t("Difference")} sortKey="delta" align="right" {...th} />
              <th className="px-4 py-3 font-medium">{t("Signed by")}</th>
              <th className="px-4 py-3 font-medium text-center">{t("Released")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3 max-w-56">
                  <a href={`/api/payments/files/invoice/${r.id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{r.filename}</a>
                  <div><DownloadLink href={`/api/payments/files/invoice/${r.id}?download=1`} filename={r.filename} className="text-xs text-gray-500 hover:underline">{t("Download")}</DownloadLink></div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span title={[t(STATUS_HOVER[r.status]), r.paidOn, r.paidUnsigned ? t(PAID_UNSIGNED) : ""].filter(Boolean).join(" ")} className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium cursor-help ${STATUS_LOOK[r.status]}`}>
                    {t(STATUS_LABELS[r.status])}
                    {r.paidUnsigned && " ⚠"}
                  </span>
                </td>
                <td className="px-4 py-3">{r.supplierName || "-"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{rand(r.amountDue)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{r.invoiceDate || "-"}</td>
                <td className="px-4 py-3 text-center"><CheckIcon check={r.bank} /></td>
                <td className="px-4 py-3 text-center"><CheckIcon check={r.amount} /></td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-red-700">{r.delta === null ? "" : `${r.delta > 0 ? "+" : "-"}${rand(Math.abs(r.delta))}`}</td>
                <td className="px-4 py-3">{r.signedBy.map((s) => s.name).join(", ") || "-"}</td>
                <td className="px-4 py-3 text-center">
                  {r.signedBy.some((s) => s.userId === session?.id) ? (
                    <input
                      type="checkbox"
                      checked={r.signedBy.some((s) => s.userId === session?.id && s.releasedAt)}
                      onChange={(e) => setReleased(r, e.target.checked)}
                      aria-label={t("I have released this payment at the bank")}
                      title={t("I have released this payment at the bank")}
                    />
                  ) : (
                    r.signedBy.filter((s) => s.releasedAt).length || ""
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {(inbox?.canSign || r.signedBy.length > 0) && <button onClick={() => openSign(r)} className="text-primary hover:underline">{inbox?.canSign && !r.signedBy.some((s) => s.userId === session?.id) ? t("Sign") : t("Signatures")}</button>}
                  {manage && r.signedBy.length === 0 && <button onClick={() => removeInvoice(r)} className="text-red-600 hover:underline ml-3">{t("Delete")}</button>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-400">{t("No invoices yet.")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!!inbox?.unmatched.length && (
        <>
          <h2 className="text-sm font-semibold text-dark mb-2">{t("Bank payments with no invoice")}</h2>
          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">{t("Paid to")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("Amount")}</th>
                  <th className="px-4 py-3 font-medium">{t("Reference")}</th>
                  <th className="px-4 py-3 font-medium text-center">{t("Amount Match")}</th>
                </tr>
              </thead>
              <tbody>
                {inbox.unmatched.map((u, i) => (
                  <tr key={`${u.screenId}-${i}`} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3">{u.payee || "-"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{rand(u.amount)}</td>
                    <td className="px-4 py-3">{u.reference || "-"}</td>
                    <td className="px-4 py-3 text-center"><CheckIcon check={u.check} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!!inbox?.screens.length && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-2">{t("Bank files loaded")}</h2>
          <ul className="text-sm space-y-1">
            {inbox.screens.map((s) => (
              <li key={s.id}>
                {!s.statement || manage ? (
                  <a href={`/api/payments/files/screen/${s.id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{s.filename}</a>
                ) : (
                  s.filename
                )}{" "}
                <span className="text-gray-500">{t("{n} payment(s)", { n: s.payments })}</span>
                {manage && <button onClick={() => removeScreen(s.id, s.filename)} className="text-red-600 hover:underline ml-3">{t("Remove")}</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {signerSettings && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-dark mb-1">{t("Who can sign invoices")}</h2>
          <p className="text-xs text-gray-500 mb-3">{t("Everyone carrying a ticked tag can sign. They also need the View Invoice Inbox permission on their role.")}</p>
          {signerSettings.tags.length === 0 && <p className="text-sm text-gray-500">{t("No tags yet. Create them under Admin > Tags.")}</p>}
          <div className="flex flex-wrap gap-4">
            {signerSettings.tags.map((tag) => (
              <label key={tag.id} className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={signerSettings.signerTagIds.includes(tag.id)}
                  onChange={(e) => saveSigners(e.target.checked ? [...signerSettings.signerTagIds, tag.id] : signerSettings.signerTagIds.filter((id) => id !== tag.id))}
                />
                {tag.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {signing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-dark mb-1 break-all">{signing.filename}</h2>
            <p className="text-sm text-gray-600 mb-4">{signing.supplierName || "-"}, {rand(signing.amountDue)}</p>
            <ul className="text-sm space-y-2 mb-4">
              <li className="flex gap-2"><CheckIcon check={signing.bank} /><span>{t(CHECK_HOVER[signing.bank.code])}</span></li>
              <li className="flex gap-2"><CheckIcon check={signing.amount} /><span>{t(CHECK_HOVER[signing.amount.code])}</span></li>
            </ul>
            {signatures.map((s) => (
              <div key={s.at} className="border-t border-gray-100 py-2 text-sm">
                <img src={s.dataUrl} alt={t("Signature of {name}", { name: s.name })} className="h-12" />
                {s.name}, {new Date(s.at).toLocaleString("en-ZA")}
                {s.override && <span className="text-red-600"> {t("(signed despite a red check)")}</span>}
              </div>
            ))}
            {inbox?.canSign && !mine && (
              <div className="mt-4">
                <SignaturePad name={`${session?.name ?? ""} ${session?.surname ?? ""}`.trim()} onChange={setMark} />
                {red && (
                  <label className="flex gap-2 text-sm text-red-700 mt-3">
                    <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                    {t("I have looked into the red check and want to sign anyway.")}
                  </label>
                )}
              </div>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setSigning(null)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">{t("Close")}</button>
              {inbox?.canSign && !mine && (
                <button onClick={sign} disabled={busy || !mark || (red && !override)} className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  {busy ? t("Signing...") : t("Sign invoice")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
