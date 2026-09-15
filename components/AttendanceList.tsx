import type { AttendeeRow } from "@/lib/minutes";

// An attendance list as it reads on screen: position and name in two lined-up
// columns with no borders, the same shape the Word file prints. Used on the
// minutes page and the page people sign, so what is signed is what is printed.

export default function AttendanceList({
  rows,
  indent = false,
}: {
  rows: AttendeeRow[];
  /** Indented under a heading, as on a letterhead. */
  indent?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={`overflow-x-auto ${indent ? "pl-6 sm:pl-10" : ""}`}>
      <table className="text-sm mt-1">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="py-0.5 pr-8 sm:pr-16 text-gray-700">{r.position}</td>
              <td className="py-0.5 text-dark">{r.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
