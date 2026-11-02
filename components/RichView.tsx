"use client";

import type { CSSProperties, ReactNode } from "react";
import type { RichMark, RichNode } from "@/lib/richDoc";

// A formatted section, drawn by walking the stored document with React.
// 🔴 Never as HTML: every value here has been through cleanDoc, and React
// escapes all text, so pasted content cannot inject anything into the page.

function styled(text: ReactNode, marks: RichMark[] | undefined, key: number): ReactNode {
  if (!marks?.length) return <span key={key}>{text}</span>;
  const style: CSSProperties = {};
  const deco: string[] = [];
  let tag: string | undefined;
  for (const m of marks) {
    if (m.type === "bold") style.fontWeight = 700;
    else if (m.type === "italic") style.fontStyle = "italic";
    else if (m.type === "underline") deco.push("underline");
    else if (m.type === "strike") deco.push("line-through");
    else if (m.type === "highlight") style.backgroundColor = m.attrs?.color;
    else if (m.type === "personTag") {
      style.borderBottom = "1px dotted #6b7280";
      tag = m.attrs?.name;
    }
    else if (m.type === "textStyle") {
      if (m.attrs?.color) style.color = m.attrs.color;
      if (m.attrs?.fontFamily) style.fontFamily = m.attrs.fontFamily;
      if (m.attrs?.fontSize) style.fontSize = m.attrs.fontSize;
    }
  }
  if (deco.length) style.textDecoration = deco.join(" ");
  return (
    <span key={key} style={style} title={tag}>
      {text}
    </span>
  );
}

function inline(nodes: RichNode[] | undefined): ReactNode[] {
  return (nodes ?? []).map((n, i) =>
    n.type === "hardBreak" ? <br key={i} /> : n.type === "text" ? styled(n.text, n.marks, i) : null
  );
}

function block(n: RichNode, key: number): ReactNode {
  switch (n.type) {
    case "paragraph":
      return (
        <p key={key} className="min-h-[1.25em]">
          {inline(n.content)}
        </p>
      );
    case "heading":
      return (
        <p key={key} className={n.attrs?.level === 1 ? "text-lg font-bold" : "font-bold"}>
          {inline(n.content)}
        </p>
      );
    case "bulletList":
      return (
        <ul key={key} className="list-disc pl-6">
          {(n.content ?? []).map(block)}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} className="list-decimal pl-6" start={Number(n.attrs?.start ?? 1)}>
          {(n.content ?? []).map(block)}
        </ol>
      );
    case "listItem":
      return <li key={key}>{(n.content ?? []).map(block)}</li>;
    case "table":
      return (
        <div key={key} className="my-2 overflow-x-auto">
          <table className="border-collapse text-sm">
            <tbody>
              {(n.content ?? []).map((row, ri) => (
                <tr key={ri}>
                  {(row.content ?? []).map((c, ci) => {
                    const Cell = c.type === "tableHeader" ? "th" : "td";
                    return (
                      <Cell
                        key={ci}
                        colSpan={Number(c.attrs?.colspan ?? 1)}
                        rowSpan={Number(c.attrs?.rowspan ?? 1)}
                        className={`border border-gray-300 px-2 py-1 align-top text-left ${c.type === "tableHeader" ? "bg-gray-50 font-medium" : ""}`}
                      >
                        {(c.content ?? []).map(block)}
                      </Cell>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element -- a private, signed-in image route
        <img
          key={key}
          src={String(n.attrs?.src)}
          alt=""
          width={Number(n.attrs?.width) || undefined}
          height={Number(n.attrs?.height) || undefined}
          className="my-2 max-w-full h-auto rounded border border-gray-200"
        />
      );
    default:
      return null;
  }
}

export default function RichView({ doc, className = "text-sm text-gray-700" }: { doc: RichNode; className?: string }) {
  return <div className={`${className} space-y-1`}>{(doc.content ?? []).map(block)}</div>;
}
