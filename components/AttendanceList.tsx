import type { AttendeeRow, ListGroup } from "@/lib/minutes";

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

/** The lists a section draws (see sectionListGroups): an attendance list, or
 *  the Apologies section's two lists, each with its sub-heading and its
 *  "None." when empty. */
export function AttendanceGroups({
  groups,
  indent = false,
}: {
  groups: ListGroup[];
  indent?: boolean;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="space-y-2">
      {groups.map((g, i) => (
        <div key={i}>
          {g.heading && (
            <p className={`text-sm font-semibold text-dark mt-3 ${indent ? "pl-6 sm:pl-10" : ""}`}>
              {g.heading}
            </p>
          )}
          {g.rows.length > 0 ? (
            <AttendanceList rows={g.rows} indent={indent} />
          ) : g.emptyText ? (
            <p className={`text-sm text-gray-400 italic mt-1 ${indent ? "pl-6 sm:pl-10" : ""}`}>
              {g.emptyText}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
