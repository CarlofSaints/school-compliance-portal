// The categories a policy can be filed under.
//
// This module has no imports so both the browser and the server can use it.
// The list itself is editable in Admin > Policy Categories; what lives here is
// the starting set a school gets before anyone has changed anything.
export const DEFAULT_POLICY_CATEGORIES = [
  "General",
  "Finance",
  "Governance",
  "HR",
  "Safety",
  "Admissions",
  "Discipline",
  "Curriculum",
  "Infrastructure",
];

// "General" is what an upload falls back to when no category is given, and what
// a recovered policy is filed under, so it always has to exist. Everything else
// can be renamed or removed.
export const REQUIRED_POLICY_CATEGORY = "General";

// The list to show for a policy already filed under `current`.
//
// A <select> whose value matches none of its options silently displays the
// FIRST one instead, and saving from there would write that wrong value back.
// So a category that is not on the current list — one that was removed after
// this policy was filed under it — is kept as an option rather than quietly
// swapped for something else.
export function categoryOptions(
  current: string,
  categories: string[]
): string[] {
  const options = [...categories];
  if (current && !options.includes(current)) options.unshift(current);
  return options;
}

// Tidies a list coming from the admin form: trimmed, no blanks, no duplicates
// (case-insensitive), and always containing the required one.
export function normaliseCategories(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  if (!out.some((c) => c.toLowerCase() === REQUIRED_POLICY_CATEGORY.toLowerCase())) {
    out.unshift(REQUIRED_POLICY_CATEGORY);
  }
  return out;
}
