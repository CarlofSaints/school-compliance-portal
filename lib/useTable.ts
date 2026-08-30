"use client";

import { useCallback, useEffect, useState } from "react";

export type SortDir = "asc" | "desc";

// Click-to-sort state for a grid. Shared so every table in the portal sorts
// the same way rather than each page growing its own copy.
export function useTableSort<T>(
  initialKey: string,
  initialDir: SortDir = "asc"
) {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  // `firstDir` is the direction to use when this column is picked up for the
  // first time - a numeric column usually wants high-to-low, text A to Z.
  const toggle = useCallback(
    (key: string, firstDir: SortDir = "asc") => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return;
      }
      setSortKey(key);
      setSortDir(firstDir);
    },
    [sortKey]
  );

  // `value` maps a row + column key to something comparable. Numbers sort
  // numerically, everything else as text; blanks always sort last regardless
  // of direction, so an empty cell never floats to the top of the grid.
  const sort = useCallback(
    (rows: T[], value: (row: T, key: string) => unknown): T[] => {
      const sorted = [...rows].sort((a, b) => {
        const av = value(a, sortKey);
        const bv = value(b, sortKey);

        const aEmpty = av === undefined || av === null || av === "";
        const bEmpty = bv === undefined || bv === null || bv === "";
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;

        let cmp: number;
        if (typeof av === "number" && typeof bv === "number") {
          cmp = av - bv;
        } else if (typeof av === "boolean" && typeof bv === "boolean") {
          cmp = Number(av) - Number(bv);
        } else {
          cmp = String(av).localeCompare(String(bv), undefined, {
            numeric: true,
            sensitivity: "base",
          });
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
      return sorted;
    },
    [sortKey, sortDir]
  );

  return { sortKey, sortDir, toggle, sort };
}

const MIN_WIDTH = 60;

// Per-table column widths, remembered in the browser so a person's layout
// survives a reload. Storage is per viewer and best-effort: a private window or
// blocked site data just means the defaults.
export function useColumnWidths(
  storageKey: string,
  defaults: Record<string, number>
) {
  const [widths, setWidths] = useState<Record<string, number>>(defaults);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, number>;
        // Merge over the defaults so a column added later still gets a width.
        setWidths({ ...defaults, ...saved });
      }
    } catch {
      // ignore - defaults are fine
    }
    // Defaults are a literal at the call site; keying on storageKey is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const setWidth = useCallback(
    (key: string, width: number) => {
      setWidths((prev) => {
        const next = { ...prev, [key]: Math.max(MIN_WIDTH, Math.round(width)) };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [storageKey]
  );

  const reset = useCallback(() => {
    setWidths(defaults);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  return { widths, setWidth, reset };
}
