"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export interface RowAction {
  label: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
}

// Per-row actions menu. Built by hand rather than with <details> because a
// native <details> does not close on Escape or on a click elsewhere, which
// leaves menus hanging open all over a grid.
export default function RowActions({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Closing on scroll too: the menu is absolutely positioned, so it would
    // otherwise drift away from its row inside the table's scroll container.
    const onScroll = () => setOpen(false);

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-medium"
      >
        Actions ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg py-1"
        >
          {actions.map((action) =>
            action.href ? (
              <Link
                key={action.label}
                href={action.href}
                role="menuitem"
                className="block px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                {action.label}
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  action.onClick?.();
                }}
                className={`block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 ${
                  action.danger ? "text-risk-high" : "text-gray-700"
                }`}
              >
                {action.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
