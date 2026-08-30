"use client";

import { useRef } from "react";
import type { SortDir } from "@/lib/useTable";

interface Props {
  label: string;
  // Omit to make the column neither sortable nor labelled with an arrow.
  sortKey?: string;
  activeKey?: string;
  dir?: SortDir;
  onSort?: (key: string) => void;
  width?: number;
  onResize?: (key: string, width: number) => void;
  // Key used for the resize handle when the column is not sortable.
  resizeKey?: string;
  align?: "left" | "right" | "center";
  // Freeze the header to the top of its scroll container. Needs an opaque
  // background, otherwise the rows show through as they pass underneath.
  stickyTop?: boolean;
  // Freeze the column to the left edge as the grid scrolls sideways.
  stickyLeft?: boolean;
}

// A grid header cell that can be clicked to sort and dragged on its right edge
// to resize. The drag handle swallows its own mouse events so resizing never
// also triggers a sort.
export default function SortableTh({
  label,
  sortKey,
  activeKey,
  dir = "asc",
  onSort,
  width,
  onResize,
  resizeKey,
  align = "left",
  stickyTop = false,
  stickyLeft = false,
}: Props) {
  const thRef = useRef<HTMLTableCellElement>(null);
  const key = resizeKey || sortKey;
  const sortable = !!sortKey && !!onSort;
  const isActive = !!sortKey && sortKey === activeKey;

  const startResize = (e: React.MouseEvent) => {
    if (!onResize || !key) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = thRef.current?.offsetWidth ?? width ?? 120;

    const onMove = (move: MouseEvent) => {
      onResize(key, startWidth + (move.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    // Held on the body so the cursor does not flicker back over the rows and
    // so dragging does not select the table text.
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const alignClass =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";

  // A frozen column has to sit above a frozen row's neighbours, so the
  // top-left cell (both frozen) gets the highest layer of the three.
  const stickyClass = [
    stickyTop || stickyLeft ? "sticky bg-gray-50" : "",
    // border-collapse is off on a frozen grid, so the header's underline has
    // to live on the cells rather than on the row.
    stickyTop ? "top-0 border-b border-gray-200" : "",
    stickyLeft ? "left-0 border-r border-gray-200" : "",
    stickyTop && stickyLeft ? "z-30" : stickyTop ? "z-20" : stickyLeft ? "z-10" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <th
      ref={thRef}
      style={width ? { width } : undefined}
      className={`${alignClass} ${stickyClass} px-4 py-3 font-medium text-gray-500 relative select-none ${
        sortable ? "cursor-pointer hover:text-gray-700" : ""
      }`}
      onClick={sortable ? () => onSort!(sortKey!) : undefined}
      title={sortable ? `Sort by ${label}` : undefined}
      scope="col"
    >
      <span className="whitespace-nowrap">
        {label}
        {isActive && (
          <span className="text-primary ml-1">{dir === "asc" ? "▲" : "▼"}</span>
        )}
      </span>
      {onResize && key && (
        <span
          onMouseDown={startResize}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-primary/30"
          title="Drag to resize"
        />
      )}
    </th>
  );
}
