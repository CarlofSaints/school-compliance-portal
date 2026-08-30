"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  IMPORT_FIELDS,
  buildDrafts,
  detectHeaderRow,
  guessMapping,
  isImportable,
  type ColumnMapping,
  type ImportDraft,
  type ImportField,
} from "@/lib/spendImport";
import { parseWorkbook } from "@/lib/spendImportSheet";

interface ImportResult {
  created: number;
  skipped: { rowNumber: number; projectName: string; reason: string }[];
  batchId: string;
}

// Spreadsheet column letter for a 0-based index, so the mapping dropdowns name
// columns the way Excel does.
function columnLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export default function SpendImportPage() {
  const { session, loading } = useAuth("manage_spend_settings");

  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [sheets, setSheets] = useState<Record<string, unknown[][]>>({});
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [parseError, setParseError] = useState("");

  const [amountsInThousands, setAmountsInThousands] = useState(false);
  const [markAllBudgeted, setMarkAllBudgeted] = useState(false);
  const [importStatus, setImportStatus] = useState<"pending" | "approved">(
    "pending"
  );

  const [existingNames, setExistingNames] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(0);

  const loadContext = useCallback(async () => {
    const [appsRes, settingsRes] = await Promise.all([
      authFetch("/api/spend"),
      authFetch("/api/settings/spend"),
    ]);
    if (appsRes.ok) {
      const apps = await appsRes.json();
      setExistingNames(
        (apps as { projectName: string }[]).map((a) => a.projectName || "")
      );
    }
    if (settingsRes.ok) {
      const s = await settingsRes.json();
      setSources(s.sourcesOfFunds || []);
    }
  }, []);

  useEffect(() => {
    if (session) loadContext();
  }, [session, loadContext]);

  const rows = useMemo(
    () => sheets[activeSheet] || [],
    [sheets, activeSheet]
  );
  const headers = useMemo(() => rows[headerRow] || [], [rows, headerRow]);

  const handleFile = async (file: File) => {
    setParseError("");
    setResult(null);
    setError("");
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const { sheetNames: names, sheets: parsed } = await parseWorkbook(buffer);
      const first =
        names.find((n) => (parsed[n] || []).length > 0) || names[0];
      setSheets(parsed);
      setSheetNames(names);
      selectSheet(first, parsed);
    } catch {
      setParseError(
        "Could not read that file. Save it as .xlsx or .csv and try again."
      );
    }
  };

  const selectSheet = (name: string, parsed = sheets) => {
    setActiveSheet(name);
    const sheetRows = parsed[name] || [];
    const detected = detectHeaderRow(sheetRows);
    setHeaderRow(detected);
    setMapping(guessMapping(sheetRows[detected] || []));
  };

  const drafts: ImportDraft[] = useMemo(() => {
    if (rows.length === 0) return [];
    return buildDrafts(
      rows,
      headerRow,
      mapping,
      {
        configuredSources: sources,
        defaultSource: "Other",
        amountsInThousands,
        markAllBudgeted,
        sourceLabel: fileName,
      },
      existingNames
    );
  }, [
    rows,
    headerRow,
    mapping,
    sources,
    amountsInThousands,
    markAllBudgeted,
    fileName,
    existingNames,
  ]);

  const importable = drafts.filter(isImportable);
  const duplicates = drafts.filter((d) => d.duplicate && d.errors.length === 0);
  const broken = drafts.filter((d) => d.errors.length > 0);

  const handleImport = async () => {
    setImporting(true);
    setError("");
    try {
      const res = await authFetch("/api/spend/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: importStatus,
          sourceFile: fileName,
          rows: importable.map((d) => ({
            rowNumber: d.rowNumber,
            projectName: d.projectName,
            description: d.description,
            estimatedAmount: d.estimatedAmount,
            sourceOfFunds: d.sourceOfFunds,
            custodian: d.custodian,
            budgeted: d.budgeted,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed");
      } else {
        setResult(data);
        await loadContext();
      }
    } catch {
      setError("Import failed. Check your connection and try again.");
    } finally {
      setImporting(false);
    }
  };

  const handleUndo = async () => {
    if (!result?.batchId) return;
    setUndoing(true);
    setError("");
    try {
      const res = await authFetch(
        `/api/spend/import?batch=${encodeURIComponent(result.batchId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not undo the import");
      } else {
        setUndone(data.removed || 0);
        setResult(null);
        await loadContext();
      }
    } catch {
      setError("Could not undo the import. Check your connection.");
    } finally {
      setUndoing(false);
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">
            Import Projects from Excel
          </h1>
          <p className="text-gray-500 text-sm">
            Load an existing project list straight into Spend Applications.
          </p>
        </div>
        <Link
          href="/spend"
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Back to Applications
        </Link>
      </div>

      {/* Step 1: file */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
        <h2 className="font-semibold text-dark mb-1">1. Choose your file</h2>
        <p className="text-xs text-gray-500 mb-3">
          Excel (.xlsx, .xls) or CSV. The file is read in your browser, so a big
          list will not time out.
        </p>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary-dark"
        />
        {fileName && (
          <p className="text-xs text-gray-500 mt-2">
            Loaded <span className="font-medium">{fileName}</span>
          </p>
        )}
        {parseError && (
          <p className="text-sm text-risk-high mt-2">{parseError}</p>
        )}
      </div>

      {rows.length > 0 && (
        <>
          {/* Step 2: sheet + header row */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
            <h2 className="font-semibold text-dark mb-3">
              2. Sheet and header row
            </h2>
            <div className="flex flex-wrap gap-4 items-end">
              {sheetNames.length > 1 && (
                <label className="text-xs text-gray-500">
                  Sheet
                  <select
                    value={activeSheet}
                    onChange={(e) => selectSheet(e.target.value)}
                    className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark"
                  >
                    {sheetNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-xs text-gray-500">
                Header row (row number in Excel)
                <input
                  type="number"
                  min={1}
                  max={rows.length}
                  value={headerRow + 1}
                  onChange={(e) => {
                    const next = Math.min(
                      Math.max(parseInt(e.target.value, 10) || 1, 1),
                      rows.length
                    );
                    setHeaderRow(next - 1);
                    setMapping(guessMapping(rows[next - 1] || []));
                  }}
                  className="block mt-1 w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark"
                />
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Detected headers:{" "}
              <span className="text-dark">
                {headers
                  .map((h) => String(h ?? "").trim())
                  .filter(Boolean)
                  .join(", ") || "(none)"}
              </span>
            </p>
          </div>

          {/* Step 3: mapping */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
            <h2 className="font-semibold text-dark mb-1">
              3. Match your columns
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Guessed from the headers. Change anything that looks wrong.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {IMPORT_FIELDS.map((field) => (
                <label key={field.key} className="text-xs text-gray-500">
                  {field.label}
                  {field.required && (
                    <span className="text-risk-high"> (required)</span>
                  )}
                  <select
                    value={
                      mapping[field.key] === undefined
                        ? ""
                        : String(mapping[field.key])
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      setMapping((prev) => {
                        const next: ColumnMapping = { ...prev };
                        if (raw === "") {
                          delete next[field.key as ImportField];
                        } else {
                          next[field.key as ImportField] = parseInt(raw, 10);
                        }
                        return next;
                      });
                    }}
                    className="block mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark"
                  >
                    <option value="">Not imported</option>
                    {headers.map((h, i) => (
                      <option key={i} value={String(i)}>
                        {columnLetter(i)}:{" "}
                        {String(h ?? "").trim() || "(blank header)"}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          {/* Step 4: options */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
            <h2 className="font-semibold text-dark mb-3">4. Import options</h2>
            <div className="flex flex-wrap gap-6 items-start">
              <label className="text-xs text-gray-500">
                Bring them in as
                <select
                  value={importStatus}
                  onChange={(e) =>
                    setImportStatus(e.target.value as "pending" | "approved")
                  }
                  className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark"
                >
                  <option value="pending">Applied (awaiting decision)</option>
                  <option value="approved">Already approved</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 mt-5">
                <input
                  type="checkbox"
                  checked={markAllBudgeted}
                  onChange={(e) => setMarkAllBudgeted(e.target.checked)}
                />
                Mark every project as budgeted
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 mt-5">
                <input
                  type="checkbox"
                  checked={amountsInThousands}
                  onChange={(e) => setAmountsInThousands(e.target.checked)}
                />
                Amounts are in thousands (multiply by 1000)
              </label>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Amounts are read exactly as they appear in the sheet. Only tick
              the thousands box if a cell reading 41 means R41 000. Check the
              preview below before importing.
            </p>
          </div>

          {/* Step 5: preview */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
            <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-dark">5. Preview</h2>
                <p className="text-xs text-gray-500 mt-1">
                  {importable.length} to import
                  {duplicates.length > 0 &&
                    `, ${duplicates.length} already in the portal`}
                  {broken.length > 0 && `, ${broken.length} with a problem`}
                  {". "}
                  Total R
                  {importable
                    .reduce((sum, d) => sum + d.estimatedAmount, 0)
                    .toLocaleString()}
                </p>
              </div>
              <button
                onClick={handleImport}
                disabled={importing || importable.length === 0}
                className="bg-primary hover:bg-primary-dark disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {importing
                  ? "Importing..."
                  : `Import ${importable.length} project${
                      importable.length === 1 ? "" : "s"
                    }`}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      Row
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      Project
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      Custodian
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      Source
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      Amount
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      Budgeted
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d) => {
                    const ok = isImportable(d);
                    return (
                      <tr
                        key={d.rowNumber}
                        className={`border-b border-gray-50 ${
                          ok ? "" : "bg-gray-50/60 text-gray-400"
                        }`}
                      >
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {d.rowNumber}
                        </td>
                        <td className="px-4 py-3 font-medium max-w-[220px] truncate">
                          {d.projectName || "(blank)"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {d.custodian || "-"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {d.sourceOfFunds}
                        </td>
                        <td className="px-4 py-3">
                          R{d.estimatedAmount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {d.budgeted ? "Yes" : "No"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {d.errors.length > 0 ? (
                            <span className="px-2 py-1 rounded bg-risk-high/10 text-risk-high font-medium">
                              {d.errors.join(", ")}
                            </span>
                          ) : d.duplicate ? (
                            <span className="px-2 py-1 rounded bg-risk-medium/10 text-risk-medium font-medium">
                              Already exists
                            </span>
                          ) : d.warnings.length > 0 ? (
                            <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 font-medium">
                              {d.warnings.join(", ")}
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-medium">
                              Ready
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {drafts.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-6 py-12 text-center text-gray-400"
                      >
                        No rows found below the header row.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="bg-risk-high/10 text-risk-high rounded-xl p-4 text-sm mb-4">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-dark mb-2">
            Imported {result.created} project
            {result.created === 1 ? "" : "s"}
          </h2>
          {result.skipped.length > 0 && (
            <div className="text-sm text-gray-600 mb-3">
              <p className="mb-1">Skipped {result.skipped.length}:</p>
              <ul className="list-disc pl-5 text-xs text-gray-500">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    Row {s.rowNumber} {s.projectName && `"${s.projectName}"`} -{" "}
                    {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <Link
              href="/spend"
              className="inline-block bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              View Spend Applications
            </Link>
            <button
              onClick={handleUndo}
              disabled={undoing}
              className="bg-gray-100 hover:bg-gray-200 disabled:text-gray-400 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {undoing ? "Undoing..." : "Undo this import"}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Undo removes only the {result.created} project
            {result.created === 1 ? "" : "s"} this import created. Anything
            captured by hand is untouched.
          </p>
        </div>
      )}

      {undone > 0 && !result && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-sm text-gray-600">
          Import undone. Removed {undone} project{undone === 1 ? "" : "s"}.
        </div>
      )}
    </div>
  );
}
