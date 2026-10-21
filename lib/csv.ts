/**
 * One CSV cell, quoted, and safe to open in a spreadsheet. Used by every CSV
 * export (activity log, action items, spend); pure, so pages can use it too.
 *
 * Formula injection: Excel runs a cell starting with = + - @ (or a tab / CR
 * before one), and a stranger's input reaches these files. Such a cell gets a
 * leading quote and opens as plain text. A plain number or phone number
 * ("-500", "+27 82 123 4567") is left exactly as it is. Judged on the first
 * non-whitespace character: " =1" or "\n=1" runs too.
 */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  const lead = s.trimStart();
  if (/^[\t\r]/.test(s) || /^[=@]/.test(lead) || (/^[+-]/.test(lead) && !/^[+-]?[\d\s.,()]+$/.test(lead))) s = "'" + s;
  // Quote everything: a value can contain a comma, a quote or a newline, and
  // a CSV that breaks on one row loses the rest of the file.
  return `"${s.replace(/"/g, '""')}"`;
}
