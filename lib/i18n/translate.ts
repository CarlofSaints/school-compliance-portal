// Shared by server and client. No imports, so a client component can use it
// without dragging the dictionaries (server-only) into the browser bundle.
export type Dict = Record<string, string>;
export type Vars = Record<string, string | number>;
export type T = (english: string, vars?: Vars) => string;

export function makeT(dict: Dict): T {
  return (english, vars) => {
    const out = dict[english] || english;
    if (!vars) return out;
    return out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  };
}

// Marks a string defined OUTSIDE render (a nav list, an options array) so the
// extract script finds it. Translate it where it is shown, with t(item.label).
export const tk = (english: string) => english;
