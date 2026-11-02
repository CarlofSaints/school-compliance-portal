"use client";

import { bodyBlocks } from "@/lib/minutesBody";
import RichView from "@/components/RichView";
import type { RichNode } from "@/lib/richDoc";

/** A section's wording with its tables and pictures drawn, the way the Word
 *  file prints them. Plain text renders exactly as it always did. */
export default function MinutesBody({
  minutesId,
  body,
  doc,
  className = "text-sm text-gray-700",
}: {
  minutesId: string;
  body: string;
  /** The formatted version, when the section has one: drawn instead. */
  doc?: RichNode;
  className?: string;
}) {
  if (doc) return <RichView doc={doc} className={className} />;
  const blocks = bodyBlocks(body);
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.kind === "text" ? (
          <p key={i} className="whitespace-pre-wrap">
            {b.lines.join("\n")}
          </p>
        ) : b.kind === "table" ? (
          <div key={i} className="my-2 overflow-x-auto">
            <table className="border-collapse text-sm">
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri} className={ri === 0 ? "bg-gray-50 font-medium" : ""}>
                    {r.map((c, ci) => (
                      <td key={ci} className="border border-gray-300 px-2 py-1 align-top">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a private, signed-in image route
          <img
            key={i}
            src={`/api/minutes/${encodeURIComponent(minutesId)}/images/${b.id}`}
            alt=""
            width={b.width}
            height={b.height}
            className="my-2 max-w-full h-auto rounded border border-gray-200"
          />
        )
      )}
    </div>
  );
}
