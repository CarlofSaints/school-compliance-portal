import { readJson, writeJson } from "./controlData";
import {
  DEFAULT_ACTION_CATEGORIES,
  normaliseActionCategories,
} from "./actionItems";

const PATH = "settings/action-categories.json";

// The school's action-item categories.
//
// Seeded from the built-in list the first time they are read, and after that
// the saved list is what counts, so a category removed in Admin stays removed
// rather than reappearing on the next read.
export async function getActionCategories(): Promise<string[]> {
  const saved = await readJson<string[] | null>(PATH, null);
  if (!Array.isArray(saved) || saved.length === 0) {
    return [...DEFAULT_ACTION_CATEGORIES];
  }
  return normaliseActionCategories(saved);
}

export async function saveActionCategories(
  categories: unknown[]
): Promise<string[]> {
  const clean = normaliseActionCategories(categories);
  await writeJson(PATH, clean);
  return clean;
}
