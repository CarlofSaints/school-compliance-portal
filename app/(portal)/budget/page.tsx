"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FeeCalculator from "@/components/FeeCalculator";
import Toast from "@/components/Toast";
import { useT } from "@/components/I18nProvider";
import { byGroup, guessColumns, lineAmount, parseGrid, rands, totals, type BudgetKind, type BudgetLine, type BudgetYear, type ColumnChoice, type FeePlan } from "@/lib/budget";
import { parseWorkbook } from "@/lib/spendImportSheet";
import { apiErrorMessage, authFetch, useAuth } from "@/lib/useAuth";

const pct = (now: number, was: number) => (was ? `${(((now - was) / Math.abs(was)) * 100).toFixed(1)}%` : "-");
const columnName = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(39 + i)}`);
const BTN = "border border-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50";
const MAIN = "bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50";
const INPUT = "px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none";
const COMBINED = "__combined__";

interface Upload {
  fileName: string;
  sheets: Record<string, unknown[][]>;
  sheetNames: string[];
  sheet: string;
  columns: ColumnChoice;
  centre: string;
}

export default function BudgetPage() {
  const t = useT();
  const { session, loading } = useAuth(["view_budget", "manage_budget"]);
  const canManage = session?.permissions.includes("manage_budget") ?? false;
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(new Date().getMonth() >= 6 ? thisYear + 1 : thisYear);
  const [budget, setBudget] = useState<BudgetYear | null>(null);
  const [view, setView] = useState(COMBINED);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ kind: BudgetKind; group: string; name: string } | null>(null);
  const [approving, setApproving] = useState<{ date: string; note: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const signedIn = !!session;
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    latest.current++;
    setBudget(null);
    setUpload(null);
    authFetch(`/api/budget/${year}`, { cache: "no-store" }).then(async (res) => {
      if (!live) return;
      if (res.ok) setBudget(await res.json());
      else setToast({ message: await apiErrorMessage(res), type: "error" });
    });
    return () => {
      live = false;
    };
  }, [signedIn, year]);

  // Only the newest answer for the year on screen counts: an older one would put back what the newer changed.
  const latest = useRef(0);
  const act = useCallback(
    async (body: object) => {
      const mine = ++latest.current;
      const res = await authFetch(`/api/budget/${year}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        setToast({ message: await apiErrorMessage(res), type: "error" });
        return false;
      }
      const saved = await res.json();
      if (mine === latest.current) setBudget(saved);
      return true;
    },
    [year]
  );

  const centres = budget?.centres ?? [];
  const showing = centres.some((c) => c.id === view) ? view : centres.length === 1 ? centres[0].id : COMBINED;
  const combined = showing === COMBINED;
  const lines = useMemo(() => (budget?.lines ?? []).filter((l) => combined || l.centre === showing), [budget, combined, showing]);
  const sums = totals(lines);
  const locked = !!budget?.approved;
  const editable = canManage && !locked && !combined;

  const saveLine = (l: BudgetLine, change: Partial<BudgetLine>) => act({ action: "saveLine", id: l.id, line: change });

  const pickFile = async (f: File) => {
    if (!budget) return;
    try {
      const { sheetNames, sheets } = await parseWorkbook(await f.arrayBuffer(), true);
      const visible = sheetNames.filter((n) => (sheets[n] || []).length > 0);
      const sheet = visible.find((n) => n.toLowerCase() === centres.find((c) => c.id === showing)?.name.toLowerCase()) ?? visible[0];
      setUpload({ fileName: f.name, sheets, sheetNames: visible, sheet, columns: guessColumns(sheets[sheet] || [], year), centre: combined ? centres[0].id : showing });
    } catch {
      setToast({ message: t("Could not read that file. Save it as .xlsx or .csv and try again."), type: "error" });
    }
  };

  const parsed = useMemo(() => (upload ? parseGrid(upload.sheets[upload.sheet] || [], upload.columns) : null), [upload]);
  const parsedSums = parsed ? totals(parsed.lines.map((l) => ({ ...l, id: "", centre: "", items: [] }))) : null;

  const loadUpload = async () => {
    if (!upload || !parsed) return;
    const name = centres.find((c) => c.id === upload.centre)?.name ?? "";
    if ((budget?.lines ?? []).some((l) => l.centre === upload.centre) && !confirm(t("This replaces the lines already in {name}. Carry on?", { name }))) return;
    if (await act({ action: "importLines", centre: upload.centre, lines: parsed.lines })) {
      setUpload(null);
      setView(upload.centre);
      setToast({ message: t("{count} lines loaded", { count: parsed.lines.length }), type: "success" });
    }
  };

  if (loading) return <div className="p-6">{t("Loading...")}</div>;

  const saveFee = (change: Partial<FeePlan>) => act({ action: "saveFee", centre: showing, plan: change });
  const feeLines = lines.filter((l) => l.kind === "income");
  const empty = !!budget && lines.length === 0;
  const columns = upload ? (upload.sheets[upload.sheet] || []).reduce((n, r) => Math.max(n, r.length), 0) : 0;
  const pickColumn = (label: string, key: keyof ColumnChoice) => (
    <label className="text-sm">
      <span className="block text-gray-600 mb-1">{label}</span>
      <select value={upload?.columns[key]} onChange={(e) => upload && setUpload({ ...upload, columns: { ...upload.columns, [key]: Number(e.target.value) } })} className={INPUT}>
        <option value={-1}>{t("None")}</option>
        {Array.from({ length: columns }, (_, i) => (
          <option key={i} value={i}>{t("Column {column}", { column: columnName(i) })}</option>
        ))}
      </select>
    </label>
  );

  const section = (kind: BudgetKind, title: string, total: number) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto mb-6">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-dark">{title}</th>
            <th className="text-right px-4 py-3 font-medium text-gray-500 whitespace-nowrap">{t("Actual {year}", { year: year - 1 })}</th>
            <th className="text-right px-4 py-3 font-medium text-gray-500 whitespace-nowrap">{t("Budget {year}", { year: year - 1 })}</th>
            <th className="text-right px-4 py-3 font-medium text-gray-500 whitespace-nowrap">{t("Budget {year}", { year })}</th>
            <th className="text-right px-4 py-3 font-medium text-gray-500">{t("Change")}</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">{t("Note")}</th>
            {editable && <th />}
          </tr>
        </thead>
        <tbody>
          {byGroup(lines.filter((l) => l.kind === kind)).map((g) => (
            <GroupRows key={g.name} group={g} isOpen={open === `${kind}:${g.name}`} onToggle={() => setOpen(open === `${kind}:${g.name}` ? null : `${kind}:${g.name}`)} editable={editable} combined={combined} centres={centres} onSave={saveLine} onDelete={(id) => act({ action: "deleteLine", id })} onAdd={() => setAdding({ kind, group: g.name, name: "" })} />
          ))}
          <tr className="bg-gray-50 font-semibold">
            <td className="px-4 py-3">{t("Total")}</td>
            <td />
            <td className="px-4 py-3 text-right">{rands(kind === "income" ? sums.lastIncome : sums.lastExpense)}</td>
            <td className="px-4 py-3 text-right">{rands(total)}</td>
            <td className="px-4 py-3 text-right">{pct(total, kind === "income" ? sums.lastIncome : sums.lastExpense)}</td>
            <td colSpan={editable ? 2 : 1} />
          </tr>
        </tbody>
      </table>
      {editable && (
        <div className="px-4 py-2 border-t border-gray-100">
          <button onClick={() => setAdding({ kind, group: "", name: "" })} className="text-primary text-xs font-medium">{t("+ Add a line")}</button>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Budget")}</h1>
          <p className="text-gray-500 text-sm">{t("Income and spending for the year, for the parents' meeting.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={t("Budget year")} value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${INPUT} bg-white`}>
            {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {canManage && !locked && (
            <>
              <button onClick={() => file.current?.click()} className={BTN}>{t("Upload Excel")}</button>
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
                  const name = prompt(t("What is this part of the budget called? For example Grade R or Hostel."));
                  if (name) act({ action: "addCentre", name });
                }}
                className={BTN}
              >
                {t("+ Add a part")}
              </button>
              <button onClick={() => setApproving({ date: "", note: "" })} className={MAIN}>{t("Mark as approved")}</button>
            </>
          )}
          {canManage && locked && (
            <button onClick={() => confirm(t("Undo the approval? The budget can then be changed.")) && act({ action: "unapprove" })} className={BTN}>{t("Undo approval")}</button>
          )}
        </div>
      </div>

      {budget?.approved && (
        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">
          {t("Approved on {date}, recorded by {by}.", { date: budget.approved.date, by: budget.approved.by })} {budget.approved.note}
        </div>
      )}

      {upload && parsed && parsedSums && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm font-medium text-dark mb-3">{upload.fileName}</p>
          <div className="flex flex-wrap gap-4 mb-3">
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">{t("Sheet")}</span>
              <select
                value={upload.sheet}
                onChange={(e) => setUpload({ ...upload, sheet: e.target.value, columns: guessColumns(upload.sheets[e.target.value] || [], year) })}
                className={INPUT}
              >
                {upload.sheetNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">{t("Load into")}</span>
              <select value={upload.centre} onChange={(e) => setUpload({ ...upload, centre: e.target.value })} className={INPUT}>
                {centres.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            {pickColumn(t("Budget {year}", { year }), "amount")}
            {pickColumn(t("Actual {year}", { year: year - 1 }), "actual")}
            {pickColumn(t("Budget {year}", { year: year - 1 }), "lastBudget")}
          </div>
          <p className="text-sm text-gray-600 mb-3">
            {t("{count} lines. Income {income}, spending {expense}. Check these match your spreadsheet.", { count: parsed.lines.length, income: rands(parsedSums.income), expense: rands(parsedSums.expense) })}{" "}
            {parsed.dormant > 0 && t("{count} lines with no figures left out.", { count: parsed.dormant })}
          </p>
          {parsedSums.expense === 0 && parsed.lines.length > 0 && <p className="text-sm text-risk-high mb-3">{t("No spending found. Check the sheet has a heading such as Expenses above its spending lines.")}</p>}
          {parsed.skipped.length > 0 && <p className="text-sm text-risk-high mb-3">{t("These rows have figures but no account code, so they were left out: {names}", { names: parsed.skipped.join(", ") })}</p>}
          <div className="flex gap-2">
            <button onClick={loadUpload} disabled={!parsed.lines.length || upload.columns.amount < 0} className={MAIN}>{t("Load these lines")}</button>
            <button onClick={() => setUpload(null)} className={BTN}>{t("Cancel")}</button>
          </div>
        </div>
      )}

      {!budget ? (
        <p className="text-sm text-gray-500">{t("Loading...")}</p>
      ) : (
        <>
          {centres.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {[{ id: COMBINED, name: t("Combined") }, ...centres].map((c) => (
                <button key={c.id} onClick={() => setView(c.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${showing === c.id ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-700"}`}>
                  {c.name}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              { label: t("Income"), value: sums.income },
              { label: t("Spending"), value: sums.expense },
              { label: sums.surplus < 0 ? t("Shortfall") : t("Surplus"), value: sums.surplus },
            ].map((c, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm text-gray-500">{c.label}</p>
                <p className={`text-2xl font-bold ${i === 2 && c.value < 0 ? "text-risk-high" : "text-dark"}`}>{rands(c.value)}</p>
              </div>
            ))}
          </div>

          {empty ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
              <p className="text-gray-500 text-sm mb-4">{t("There is no budget here yet.")}</p>
              {editable || (canManage && centres.length === 1) ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <button onClick={() => file.current?.click()} className={MAIN}>{t("Upload your Excel budget")}</button>
                  <button onClick={() => act({ action: "starter", centre: showing })} className={BTN}>{t("Start from the standard list")}</button>
                  <button onClick={() => act({ action: "copy" })} className={BTN}>{t("Copy last year's budget")}</button>
                  {centres.length > 1 && <button onClick={() => act({ action: "removeCentre", id: showing })} className={BTN}>{t("Remove this part")}</button>}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {!combined && (
                <FeeCalculator
                  key={`${year}-${showing}`}
                  stored={budget.fees.find((f) => f.centre === showing)}
                  centre={showing}
                  lines={feeLines}
                  editable={editable}
                  onSave={saveFee}
                  onUse={async (line, amount, note, plan) => {
                    if (!(await saveLine(line, { amount, items: [], note }))) return false;
                    return saveFee(plan);
                  }}
                />
              )}

              {section("income", t("Income"), sums.income)}
              {section("expense", t("Spending"), sums.expense)}
            </>
          )}
        </>
      )}

      {adding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ action: "saveLine", line: { ...adding, centre: showing, amount: 0, actual: 0, lastBudget: 0, note: "", code: "", items: [] } })) setAdding(null);
            }}
            className="bg-white rounded-xl w-full max-w-md p-6 space-y-4"
          >
            <h2 className="text-lg font-semibold">{t("+ Add a line")}</h2>
            <label className="block text-sm">
              <span className="block text-gray-700 mb-1">{t("Group")}</span>
              <input list="budget-groups" value={adding.group} onChange={(e) => setAdding({ ...adding, group: e.target.value })} required className={`${INPUT} w-full`} />
              <datalist id="budget-groups">
                {byGroup(lines.filter((l) => l.kind === adding.kind)).map((g) => (
                  <option key={g.name} value={g.name} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm">
              <span className="block text-gray-700 mb-1">{t("Line name")}</span>
              <input autoFocus value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} required className={`${INPUT} w-full`} />
            </label>
            <div className="flex gap-2">
              <button type="submit" className={MAIN}>{t("Save")}</button>
              <button type="button" onClick={() => setAdding(null)} className={BTN}>{t("Cancel")}</button>
            </div>
          </form>
        </div>
      )}

      {approving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ action: "approve", ...approving })) setApproving(null);
            }}
            className="bg-white rounded-xl w-full max-w-md p-6 space-y-4"
          >
            <h2 className="text-lg font-semibold">{t("Mark as approved")}</h2>
            <p className="text-sm text-gray-500">{t("This locks the budget. Do it once the meeting has approved it.")}</p>
            {totals(budget?.lines ?? []).surplus < 0 && <p className="text-sm text-risk-high">{t("This budget shows a shortfall.")}</p>}
            <label className="block text-sm">
              <span className="block text-gray-700 mb-1">{t("Date of the meeting")}</span>
              <input type="date" value={approving.date} onChange={(e) => setApproving({ ...approving, date: e.target.value })} required className={`${INPUT} w-full`} />
            </label>
            <label className="block text-sm">
              <span className="block text-gray-700 mb-1">{t("Note")}</span>
              <input value={approving.note} onChange={(e) => setApproving({ ...approving, note: e.target.value })} className={`${INPUT} w-full`} />
            </label>
            <div className="flex gap-2">
              <button type="submit" className={MAIN}>{t("Mark as approved")}</button>
              <button type="button" onClick={() => setApproving(null)} className={BTN}>{t("Cancel")}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function GroupRows({ group, isOpen, onToggle, editable, combined, centres, onSave, onDelete, onAdd }: {
  group: ReturnType<typeof byGroup>[number];
  isOpen: boolean;
  onToggle: () => void;
  editable: boolean;
  combined: boolean;
  centres: { id: string; name: string }[];
  onSave: (l: BudgetLine, change: Partial<BudgetLine>) => Promise<boolean>;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const t = useT();
  return (
    <>
      <tr className="border-b border-gray-50 font-medium cursor-pointer hover:bg-gray-50" onClick={onToggle}>
        <td className="px-4 py-2.5">
          <button type="button" aria-expanded={isOpen} className="text-left">
            <span className="inline-block w-4 text-gray-400">{isOpen ? "▾" : "▸"}</span>
            {group.name}
          </button>
        </td>
        <td className="px-4 py-2.5 text-right">{rands(group.actual)}</td>
        <td className="px-4 py-2.5 text-right">{rands(group.lastBudget)}</td>
        <td className="px-4 py-2.5 text-right">{rands(group.amount)}</td>
        <td className="px-4 py-2.5 text-right text-gray-500">{pct(group.amount, group.lastBudget)}</td>
        <td colSpan={editable ? 2 : 1} />
      </tr>
      {isOpen &&
        group.lines.map((l) => (
          <tr key={l.id} className="border-b border-gray-50 text-gray-700 align-top">
            <td className="pl-9 pr-4 py-2">
              {l.name}
              {combined && <span className="text-xs text-gray-400"> · {centres.find((c) => c.id === l.centre)?.name}</span>}
              {l.code && <span className="block text-xs text-gray-400">{l.code}</span>}
            </td>
            <td className="px-4 py-2 text-right">{rands(l.actual)}</td>
            <td className="px-4 py-2 text-right">{rands(l.lastBudget)}</td>
            <td className="px-4 py-2 text-right">
              {editable ? (
                <input key={l.amount} type="number" aria-label={l.name} defaultValue={lineAmount(l)} onBlur={(e) => Number(e.target.value) !== lineAmount(l) && onSave(l, { amount: Number(e.target.value), items: [] })} className={`${INPUT} w-32 text-right`} />
              ) : (
                rands(lineAmount(l))
              )}
            </td>
            <td className="px-4 py-2 text-right text-gray-500">{pct(lineAmount(l), l.lastBudget)}</td>
            <td className="px-4 py-2">
              {editable ? (
                <input key={l.note} aria-label={t("Note")} defaultValue={l.note} onBlur={(e) => e.target.value.trim() !== l.note && onSave(l, { note: e.target.value })} className={`${INPUT} w-56`} />
              ) : (
                <span className="text-xs text-gray-500">{l.note}</span>
              )}
            </td>
            {editable && (
              <td className="px-2 py-2">
                <button onClick={() => confirm(t("Remove this line?")) && onDelete(l.id)} aria-label={t("Remove this line?")} className="text-risk-high text-xs">x</button>
              </td>
            )}
          </tr>
        ))}
      {isOpen && editable && (
        <tr className="border-b border-gray-50">
          <td colSpan={7} className="pl-9 py-1.5">
            <button onClick={onAdd} className="text-primary text-xs font-medium">{t("+ Add a line")}</button>
          </td>
        </tr>
      )}
    </>
  );
}
