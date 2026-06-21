import { readJson, writeJson } from "./controlData";

export interface SpendSettings {
  capexBudget: number;
  capexYear: number;
  financialYearEndMonth: number; // 1–12; the month the financial year ends (12 = Dec)
  sourcesOfFunds: string[];
  supplierConnections: string[];
}

const SPEND_SETTINGS_PATH = "settings/spend-settings.json";

// Funding sources that must always be available, in this order, regardless of
// what's been saved before. The CAPEX source is what the CAPEX budget variance
// report measures against.
export const CANONICAL_SOURCES = [
  "CAPEX",
  "Maintenance (P&L)",
  "Fundraising",
  "Other",
];

const DEFAULT_SPEND_SETTINGS: SpendSettings = {
  capexBudget: 0,
  capexYear: new Date().getFullYear(),
  financialYearEndMonth: 12, // December (calendar year) by default
  sourcesOfFunds: [...CANONICAL_SOURCES, "Grade 7 Gift", "Expensed"],
  supplierConnections: [
    "None",
    "Parent",
    "SGB Member",
    "Friend of Parent",
    "Teacher",
    "Relative of Teacher",
    "Relative of Parent",
    "Relative of SGB Member",
  ],
};

// Guarantee the canonical sources are present (first, in order), then keep any
// extra custom sources the school has added. Used on every read so existing
// saved settings transparently gain the required options.
function withCanonicalSources(sources: string[]): string[] {
  const extras = sources.filter((s) => !CANONICAL_SOURCES.includes(s));
  return [...CANONICAL_SOURCES, ...extras];
}

export async function getSpendSettings(): Promise<SpendSettings> {
  const settings = await readJson<SpendSettings>(
    SPEND_SETTINGS_PATH,
    DEFAULT_SPEND_SETTINGS
  );
  return {
    ...settings,
    financialYearEndMonth: settings.financialYearEndMonth || 12,
    sourcesOfFunds: withCanonicalSources(settings.sourcesOfFunds || []),
  };
}

export async function saveSpendSettings(
  settings: SpendSettings
): Promise<void> {
  return writeJson(SPEND_SETTINGS_PATH, settings);
}
