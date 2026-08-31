import { readJson, writeJson } from "./controlData";
import {
  DEFAULT_POLICY_CATEGORIES,
  normaliseCategories,
} from "./policyCategories";

const PATH = "settings/policy-categories.json";

// The school's policy categories.
//
// Seeded from the built-in list the first time they are read, and after that
// the saved list is what counts — deliberately, so a category removed in Admin
// stays removed rather than reappearing on the next read. That is the one place
// this differs from Sources of Funds, where a canonical set is merged in every
// time because the CAPEX report measures against it.
export async function getPolicyCategories(): Promise<string[]> {
  const saved = await readJson<string[] | null>(PATH, null);
  if (!Array.isArray(saved) || saved.length === 0) {
    return [...DEFAULT_POLICY_CATEGORIES];
  }
  return normaliseCategories(saved);
}

export async function savePolicyCategories(
  categories: string[]
): Promise<string[]> {
  const clean = normaliseCategories(categories);
  await writeJson(PATH, clean);
  return clean;
}
