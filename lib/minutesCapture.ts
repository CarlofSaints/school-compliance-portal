// "+ Add to action items" in the minutes editor: what text it takes and what
// the action is called. Pure, so scripts/check-minutes-capture.ts can test it.

/**
 * What "Add to action items" takes from a text box: the selected text if there
 * is any, otherwise the paragraph the cursor is in (lines up to the nearest
 * blank line). Minute-takers type one point per paragraph, so the cursor's
 * paragraph is the point they have just written.
 */
export function captureText(body: string, start: number, end: number): string {
  if (end > start) return body.slice(start, end).trim();
  const before = body.lastIndexOf("\n\n", Math.max(0, start - 1));
  const after = body.indexOf("\n\n", start);
  return body.slice(before === -1 ? 0 : before + 2, after === -1 ? body.length : after).trim();
}

/** The action's name: the first line of the captured text, cut at a word
 *  near 120 characters. The full wording goes in the description. */
export function quickActionTitle(text: string): string {
  // A list marker ("- ", "3. ", "2) ") is not part of the name; a leading
  // number that is ("2026 budget") stays.
  const first = text.trim().split("\n")[0].trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, "");
  if (first.length <= 120) return first || text.trim().slice(0, 120);
  const cut = first.slice(0, 120);
  const space = cut.lastIndexOf(" ");
  return (space > 60 ? cut.slice(0, space) : cut) + "...";
}
