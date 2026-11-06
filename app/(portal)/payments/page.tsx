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
import { CHECK_HOVER, NO_PROOF, PAID_UNSIGNED, STATUS_HOVER, STATUS_LABELS, statusCount, type Check, type InboxRow, type InvoiceStatus, type NoticeRow, type Progress, type UnmatchedLine } from "@/lib/payments";

// The invoice inbox. Files go up one at a time (a request is capped at 4.5 MB)
// and three at once, so a month-end batch does not take all morning.

interface Inbox {
  rows: InboxRow[];
  notices: NoticeRow[];
  unmatched: UnmatchedLine[];
  screens: { id: string; filename: string; loadedAt: string; payments: number; statement: boolean; signed: boolean }[];
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

const AT_ONCE = 3;
const STATUS_ORDER = Object.keys(STATUS_LABELS) as InvoiceStatus[];
const STATUS_LOOK: Record<InvoiceStatus, string> = {
  pending_approval: "bg-gray-100 text-gray-600",
  pending_signatures: "bg-amber-50 text-amber-700",
  signing: "bg-blue-50 text-blue-700",
  approving: "bg-indigo-50 text-indigo-700",
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

/** Who has signed each line of the stamp, who has approved at the bank, who is still owed. */
function Slots({ progress }: { progress: Progress }) {
  const t = useT();
  if (!progress.slots.length) return <>-</>;
  return (
    <ul className="text-xs space-y-1">
      {progress.slots.map((s, i) => (
        <li key={i}>
          {s.label && <span className="text-gray-500">{s.label}: </span>}
          {s.signer ? (
            <>
              <span className="text-dark font-medium">{s.signer}</span>{" "}
              <span className={s.approved ? "text-green-700" : "text-gray-500"}>{s.approved ? t("signed and approved") : t("signed, not yet approved")}</span>
            </>
          ) : s.waitingOn.length ? (
            <span className="text-amber-700">{t("waiting on {names}", { names: s.waitingOn.join(" / ") })}</span>
          ) : (
            <span className="text-red-600">{t("nobody with a login carries this tag")}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ row, hint = "" }: { row: { status: InvoiceStatus; progress: Progress }; hint?: string }) {
  const t = useT();
  return (
    <span title={[t(STATUS_HOVER[row.status]), hint].filter(Boolean).join(" ")} className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium cursor-help ${STATUS_LOOK[row.status]}`}>
      {t(STATUS_LABELS[row.status], statusCount(row))}
    </span>
  );
}

export default function InvoiceInboxPage() {
  const t = useT();
  const { session, loading } = useAuth(["view_payments", "manage_payments"]);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [signing, setSigning] = useState<NoticeRow | null>(null);
  const [mark, setMark] = useState<{ dataUrl: string; kind: "drawn" | "typed" } | null>(null);
  const [override, setOverride] = useState(false);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
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

  const openSign = (n: NoticeRow) => {
    setSigning(n);
    setMark(null);
    setOverride(false);
    setCode("");
    setCodeSent(false);
  };

  const sendCode = async () => {
    if (!signing) return;
    setBusy(true);
    const res = await authFetch(`/api/payments/screens/${signing.id}/code`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setToast({ message: await apiErrorMessage(res, t("Failed")), type: "error" });
      return;
    }
    setCodeSent(true);
    setToast({ message: t("Your code is on its way to your email."), type: "success" });
  };

  const sign = async () => {
    if (!signing || !mark) return;
    setBusy(true);
    const res = await authFetch(`/api/payments/screens/${signing.id}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...mark, override, code }),
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

  const setReleased = async (n: NoticeRow, released: boolean) => {
    const res = await authFetch(`/api/payments/screens/${n.id}/release`, {
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
  const red = !!signing && signing.lines.some((l) => l.bank.status !== "match" || l.amountMatch.status !== "match");
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
        <p className="bg-amber-50 text-amber-800 text-sm rounded-lg px-4 py-3 mb-4">{t("Nobody can sign payment notices yet. An administrator must choose the tags who sign.")}</p>
      )}

      {manage && (
        <>
          <div className="grid md:grid-cols-3 gap-4 mb-2">
            <div>
              <h2 className="text-sm font-semibold text-dark mb-2">{t("1. Load invoices")}</h2>
              <FileUpload multiple accept=".pdf,.png,.jpg,.jpeg,.webp" label={t("Drop one or many invoices here")} onChange={(f) => send(f, "/api/payments/invoices")} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-dark mb-2">{t("2. Load the bank payment notice")}</h2>
              <FileUpload multiple accept=".png,.jpg,.jpeg,.pdf" label={t("Drop a screenshot here, or paste it with Ctrl+V")} onChange={(f) => send(f, "/api/payments/screens")} />
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

      {!!inbox?.notices.length && (
        <>
          <h2 className="text-sm font-semibold text-dark mb-2">{t("Bank payment notices")}</h2>
          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">{t("Payment notice")}</th>
                  <th className="px-4 py-3 font-medium">{t("Status")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("Total")}</th>
                  <th className="px-4 py-3 font-medium">{t("Signatures")}</th>
                  <th className="px-4 py-3 font-medium">{t("Signed Notice")}</th>
                  <th className="px-4 py-3 font-medium text-center">{t("Approved at bank")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {inbox.notices.map((n) => {
                  const signedThis = n.signedBy.some((s) => s.userId === session?.id);
                  return (
                    <tr key={n.id} className="border-b border-gray-50 last:border-0 align-top">
                      <td className="px-4 py-3 max-w-56">
                        <a href={`/api/payments/files/screen/${n.id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{n.filename}</a>
                        <div className="text-xs text-gray-500">{t("{n} payment(s)", { n: n.lines.length })}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><StatusPill row={n} /></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{rand(n.total)}</td>
                      <td className="px-4 py-3"><Slots progress={n.progress} /></td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {n.signedBy.length > 0 ? (
                          <>
                            <a href={`/api/payments/screens/${n.id}/signed`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t("View")}</a>
                            <div><DownloadLink href={`/api/payments/screens/${n.id}/signed?download=1`} filename={`Signed - ${n.filename.replace(/\.[^.]+$/, "")}.pdf`} className="text-xs text-gray-500 hover:underline">{t("Download")}</DownloadLink></div>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {signedThis ? (
                          <input
                            type="checkbox"
                            checked={n.signedBy.some((s) => s.userId === session?.id && s.releasedAt)}
                            onChange={(e) => setReleased(n, e.target.checked)}
                            aria-label={t("I have approved this payment at the bank")}
                            title={t("I have approved this payment at the bank")}
                          />
                        ) : (
                          `${n.progress.approved} / ${n.progress.required}`
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {(inbox.canSign || n.signedBy.length > 0) && <button onClick={() => openSign(n)} className="text-primary hover:underline">{inbox.canSign && !signedThis ? t("Sign") : t("Signatures")}</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
              <th className="px-4 py-3 font-medium">{t("Signatures")}</th>
              <th className="px-4 py-3 font-medium">{t("Signed Notice")}</th>
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
                  <StatusPill row={r} hint={[r.paidOn, r.paidUnsigned ? t(PAID_UNSIGNED) : ""].filter(Boolean).join(" ")} />
                  {r.paidUnsigned && " ⚠"}
                </td>
                <td className="px-4 py-3">
                  {r.supplierName || "-"}
                  {r.noProof && <div><span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">{t(NO_PROOF)}</span></div>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{rand(r.amountDue)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{r.invoiceDate || "-"}</td>
                <td className="px-4 py-3 text-center"><CheckIcon check={r.bank} /></td>
                <td className="px-4 py-3 text-center"><CheckIcon check={r.amount} /></td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-red-700">{r.delta === null ? "" : `${r.delta > 0 ? "+" : "-"}${rand(Math.abs(r.delta))}`}</td>
                <td className="px-4 py-3"><Slots progress={r.progress} /></td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.signedOnNotice && <div><a href={`/api/payments/screens/${r.noticeId}/signed`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t("View")}</a></div>}
                  {r.oldSignatures ? (
                    <>
                      <a href={`/api/payments/invoices/${r.id}/signed`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t("View")}</a>
                      <div><DownloadLink href={`/api/payments/invoices/${r.id}/signed?download=1`} filename={`Signed - ${r.filename.replace(/\.[^.]+$/, "")}.pdf`} className="text-xs text-gray-500 hover:underline">{t("Download")}</DownloadLink></div>
                    </>
                  ) : (
                    !r.signedOnNotice && "-"
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
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
                {manage && !s.signed && <button onClick={() => removeScreen(s.id, s.filename)} className="text-red-600 hover:underline ml-3">{t("Remove")}</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {signerSettings && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-dark mb-1">{t("Who signs the payment notice")}</h2>
          <p className="text-xs text-gray-500 mb-3">{t("Each ticked tag is one line on the stamp, for example Initiator, Principal and SGB or Board Representative. Anyone carrying that tag can sign that line. They also need the View Invoice Inbox permission on their role.")}</p>
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
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-dark mb-1 break-all">{signing.filename}</h2>
            <p className="text-sm text-gray-600 mb-3">
              {t("{n} payment(s)", { n: signing.lines.length })}, {rand(signing.total)}{" "}
              <a href={`/api/payments/files/screen/${signing.id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-2">{t("Open the notice")}</a>
            </p>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-3 font-medium">{t("Paid to")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("Amount")}</th>
                    <th className="py-2 pr-3 font-medium">{t("Invoice")}</th>
                    <th className="py-2 pr-3 font-medium text-center">{t("Bank Details Match")}</th>
                    <th className="py-2 font-medium text-center">{t("Amount Match")}</th>
                  </tr>
                </thead>
                <tbody>
                  {signing.lines.map((l, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-3">
                        {l.payee || "-"}
                        {l.reference && <div className="text-xs text-gray-500">{l.reference}</div>}
                        {l.noProof && <div><span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">{t(NO_PROOF)}</span></div>}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {rand(l.amount)}
                        {l.delta !== null && <div className="text-xs text-red-700">{l.delta > 0 ? "+" : "-"}{rand(Math.abs(l.delta))}</div>}
                      </td>
                      <td className="py-2 pr-3 break-all">
                        {l.invoiceId ? <a href={`/api/payments/files/invoice/${l.invoiceId}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{l.invoiceName}</a> : "-"}
                      </td>
                      <td className="py-2 pr-3 text-center"><CheckIcon check={l.bank} /></td>
                      <td className="py-2 text-center"><CheckIcon check={l.amountMatch} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Slots progress={signing.progress} />
            {inbox?.canSign && !mine && (
              <div className="mt-4">
                <SignaturePad name={`${session?.name ?? ""} ${session?.surname ?? ""}`.trim()} onChange={setMark} />
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <button onClick={sendCode} disabled={busy} className="border border-gray-200 hover:border-primary text-dark px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                    {codeSent ? t("Send my code again") : t("Email me a code")}
                  </button>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t("Code from your email")}
                    aria-label={t("Code from your email")}
                    autoComplete="one-time-code"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-48"
                  />
                </div>
                {red && (
                  <label className="flex gap-2 text-sm text-red-700 mt-3">
                    <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                    {t("Not every check is green. I have looked into this and want to sign anyway.")}
                  </label>
                )}
              </div>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setSigning(null)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">{t("Close")}</button>
              {inbox?.canSign && !mine && (
                <button onClick={sign} disabled={busy || !mark || !code.trim() || (red && !override)} className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  {busy ? t("Signing...") : t("Sign payment notice")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
