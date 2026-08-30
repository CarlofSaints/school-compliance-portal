// Bulk import of an existing project list (Excel / CSV) into spend applications.
//
// Pure and client-safe: the import page uses it to build the preview, and the
// API route re-runs the same normalisation on whatever it is sent, so a
// hand-crafted payload gets the same validation as the UI.
//
// Deliberately NOT positional - a school's list is hand-kept and the columns
// move around, so we match on header text and let the user correct the guess.

export type ImportField =
  | "projectName"
  | "custodian"
  | "source"
  | "amount"
  | "supplier"
  | "eta"
  | "description"
  | "budgeted";

export interface FieldSpec {
  key: ImportField;
  label: string;
  required: boolean;
  synonyms: string[];
}

export const IMPORT_FIELDS: FieldSpec[] = [
  {
    key: "projectName",
    label: "Project name",
    required: true,
    synonyms: [
      "project name",
      "project",
      "projects",
      "name",
      "item",
      "capex item",
      "project item",
      "work",
    ],
  },
  {
    key: "custodian",
    label: "Custodian / owner",
    required: false,
    synonyms: [
      "custodian",
      "owner",
      "responsible",
      "responsible person",
      "champion",
      "lead",
      "requestor",
      "requested by",
      "applicant",
      "driver",
    ],
  },
  {
    key: "source",
    label: "Source of funds",
    required: false,
    synonyms: [
      "source",
      "source of funds",
      "sources",
      "funding",
      "funding source",
      "funded by",
      "fund",
    ],
  },
  {
    key: "amount",
    label: "Estimated amount",
    required: false,
    synonyms: [
      "k amount",
      "amount",
      "r amount",
      "rand amount",
      "value",
      "cost",
      "estimate",
      "estimated amount",
      "estimated cost",
      "budget amount",
      "total",
      "price",
      "quote",
    ],
  },
  {
    key: "supplier",
    label: "Supplier",
    required: false,
    synonyms: [
      "supplier",
      "suppliers",
      "service provider",
      "provider",
      "contractor",
      "vendor",
    ],
  },
  {
    key: "eta",
    label: "ETA / target date",
    required: false,
    synonyms: [
      "eta",
      "due",
      "due date",
      "target",
      "target date",
      "timing",
      "timeline",
      "completion",
      "when",
      "date",
    ],
  },
  {
    key: "description",
    label: "Description",
    required: false,
    synonyms: [
      "description",
      "detail",
      "details",
      "notes",
      "note",
      "comment",
      "comments",
      "scope",
      "motivation",
    ],
  },
  {
    key: "budgeted",
    label: "Budgeted?",
    required: false,
    synonyms: ["budgeted", "in budget", "is budgeted"],
  },
];

export type ColumnMapping = Partial<Record<ImportField, number>>;

export interface ImportDraft {
  // 1-based row number as it appears in the spreadsheet, so an error message
  // points at something the user can actually find in Excel.
  rowNumber: number;
  projectName: string;
  description: string;
  estimatedAmount: number;
  sourceOfFunds: string;
  custodian: string;
  supplier: string;
  eta: string;
  budgeted: boolean;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
}

function normaliseHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBlankRow(row: unknown[]): boolean {
  return row.every((cell) => String(cell ?? "").trim() === "");
}

// Finds the row most likely to be the header by scoring each of the first rows
// against the known synonyms. A list that starts with a title row, a blank row
// or a logo therefore still imports.
export function detectHeaderRow(rows: unknown[][]): number {
  let best = 0;
  let bestScore = 0;
  const limit = Math.min(rows.length, 25);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!row || isBlankRow(row)) continue;
    let score = 0;
    for (const cellValue of row) {
      const text = normaliseHeader(cellValue);
      if (!text) continue;
      const hit = IMPORT_FIELDS.some((f) =>
        f.synonyms.some((s) => s === text || text.includes(s))
      );
      if (hit) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return bestScore > 0 ? best : 0;
}

// Guesses which column feeds which field. Exact header matches win over
// partial ones, and a column is only ever claimed by one field.
export function guessMapping(headers: unknown[]): ColumnMapping {
  const texts = headers.map(normaliseHeader);
  const mapping: ColumnMapping = {};
  const taken = new Set<number>();

  const claim = (field: ImportField, index: number) => {
    if (mapping[field] !== undefined || taken.has(index)) return;
    mapping[field] = index;
    taken.add(index);
  };

  for (const field of IMPORT_FIELDS) {
    for (let i = 0; i < texts.length; i++) {
      if (texts[i] && field.synonyms.includes(texts[i])) claim(field.key, i);
    }
  }
  for (const field of IMPORT_FIELDS) {
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text) continue;
      if (field.synonyms.some((s) => text.includes(s) || s.includes(text))) {
        claim(field.key, i);
      }
    }
  }
  return mapping;
}

// Rands out of a spreadsheet cell: "R41,000.00", "41 000", "1.234,56",
// "(2 500)" and a real number all land on the same value. Returns null for
// anything that is not a number ("TBC", "n/a", blank).
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw);
  let s = raw.replace(/[^0-9.,-]/g, "");
  if (!s || !/[0-9]/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    // Whichever separator comes last is the decimal one.
    s =
      lastComma > lastDot
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // A trailing ",50" is a decimal comma; anything else is a thousands mark.
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

export function parseBudgeted(value: unknown): boolean | null {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!text) return null;
  if (["yes", "y", "true", "1", "budgeted", "in budget"].includes(text)) {
    return true;
  }
  if (["no", "n", "false", "0", "unbudgeted", "not budgeted"].includes(text)) {
    return false;
  }
  return null;
}

// Maps a free-text source cell onto one of the school's configured funding
// sources. An unrecognised value is kept as typed rather than silently
// dropped, so nothing disappears between the sheet and the portal.
export function normaliseSource(
  value: unknown,
  configuredSources: string[]
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  const exact = configuredSources.find((s) => s.toLowerCase() === lower);
  if (exact) return exact;
  const partial = configuredSources.find(
    (s) => lower.includes(s.toLowerCase()) || s.toLowerCase().includes(lower)
  );
  return partial || raw;
}

function cell(row: unknown[], index: number | undefined): string {
  if (index === undefined) return "";
  return String(row[index] ?? "").trim();
}

export interface BuildOptions {
  configuredSources: string[];
  defaultSource: string;
  // The sheet header may read "K AMOUNT" while the cells hold full rands, so
  // this is opt-in rather than inferred from the header.
  amountsInThousands?: boolean;
  markAllBudgeted?: boolean;
  sourceLabel?: string;
}

export function buildDraft(
  row: unknown[],
  rowNumber: number,
  mapping: ColumnMapping,
  opts: BuildOptions
): ImportDraft {
  const projectName = cell(row, mapping.projectName);
  const custodian = cell(row, mapping.custodian);
  const supplier = cell(row, mapping.supplier);
  const eta = cell(row, mapping.eta);
  const notes = cell(row, mapping.description);

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!projectName) errors.push("No project name");

  const rawAmount =
    mapping.amount === undefined ? null : parseAmount(row[mapping.amount]);
  if (rawAmount === null) {
    warnings.push("No amount, imported as R0");
  }
  const multiplier = opts.amountsInThousands ? 1000 : 1;
  const estimatedAmount = rawAmount === null ? 0 : rawAmount * multiplier;
  if (estimatedAmount < 0) errors.push("Negative amount");

  const mappedSource = normaliseSource(
    mapping.source === undefined ? "" : row[mapping.source],
    opts.configuredSources
  );
  const sourceOfFunds = mappedSource || opts.defaultSource;

  const mappedBudgeted =
    mapping.budgeted === undefined
      ? null
      : parseBudgeted(row[mapping.budgeted]);
  const budgeted =
    mappedBudgeted !== null ? mappedBudgeted : !!opts.markAllBudgeted;

  const meta: string[] = [];
  if (custodian) meta.push(`Custodian: ${custodian}`);
  if (supplier) meta.push(`Supplier: ${supplier}`);
  if (eta) meta.push(`ETA: ${eta}`);
  const provenance = opts.sourceLabel
    ? `Imported from ${opts.sourceLabel} (row ${rowNumber})`
    : `Imported from a project list (row ${rowNumber})`;
  const description = [notes, meta.join(" | "), provenance]
    .filter(Boolean)
    .join("\n");

  return {
    rowNumber,
    projectName,
    description,
    estimatedAmount,
    sourceOfFunds,
    custodian,
    supplier,
    eta,
    budgeted,
    errors,
    warnings,
    duplicate: false,
  };
}

// Builds every importable draft from the parsed sheet and flags the ones that
// already exist in the portal (and repeats within the file itself).
export function buildDrafts(
  rows: unknown[][],
  headerRowIndex: number,
  mapping: ColumnMapping,
  opts: BuildOptions,
  existingNames: string[] = []
): ImportDraft[] {
  const seen = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const drafts: ImportDraft[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (isBlankRow(row)) continue;
    const draft = buildDraft(row, i + 1, mapping, opts);
    const key = draft.projectName.trim().toLowerCase();
    if (key && seen.has(key)) draft.duplicate = true;
    if (key) seen.add(key);
    drafts.push(draft);
  }
  return drafts;
}

export function isImportable(draft: ImportDraft): boolean {
  return draft.errors.length === 0 && !draft.duplicate;
}

export interface DirectoryUser {
  id: string;
  name: string;
  surname: string;
  email: string;
}

// Every distinct custodian value in the file, so the import page can ask for
// one user per name rather than once per row.
export function distinctCustodians(drafts: ImportDraft[]): string[] {
  const seen = new Set<string>();
  for (const d of drafts) {
    if (d.custodian) seen.add(d.custodian);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// Best-effort match of a custodian cell onto a portal user. A list normally
// holds a first name only ("Graham"), so a unique first-name hit counts - but
// anything ambiguous ("Dee/Graham/Alex") returns null and is left for the user
// to pick, rather than guessing a person onto a spend request.
export function matchCustodianToUser(
  custodian: string,
  users: DirectoryUser[]
): DirectoryUser | null {
  const text = custodian.trim().toLowerCase();
  if (!text) return null;

  const fullName = (u: DirectoryUser) =>
    `${u.name} ${u.surname}`.trim().toLowerCase();

  const byFull = users.filter((u) => fullName(u) === text);
  if (byFull.length === 1) return byFull[0];

  const byEmail = users.filter((u) => u.email.trim().toLowerCase() === text);
  if (byEmail.length === 1) return byEmail[0];

  const byFirst = users.filter((u) => u.name.trim().toLowerCase() === text);
  if (byFirst.length === 1) return byFirst[0];

  return null;
}

// Seeds a custodian-to-user map, keeping any choice already made by hand.
export function guessCustodianUsers(
  custodians: string[],
  users: DirectoryUser[],
  existing: Record<string, string> = {}
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const custodian of custodians) {
    if (existing[custodian] !== undefined) {
      next[custodian] = existing[custodian];
      continue;
    }
    next[custodian] = matchCustodianToUser(custodian, users)?.id || "";
  }
  return next;
}
