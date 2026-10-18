// The minutes page reloads from the server after every send, review and
// signature. Pure, so scripts/check-minutes-autosave.ts can test it.

/** The fields the minute-taker types. Everything else (status, signatures,
 *  reviews, draft number) belongs to the server. */
export interface MinutesText {
  title: string;
  body: string;
  period: unknown;
  sections: unknown;
}

/**
 * What the page shows after a reload. With typing newer than the last good
 * save, the server's copy of the text is older than the screen, so take the
 * server's workflow state but keep the local text: Carl lost a whole set of
 * minutes to a reload landing over unsaved typing.
 */
export function mergeUnsaved<T extends MinutesText>(server: T, local: T | null, hasUnsaved: boolean): T {
  if (!local || !hasUnsaved) return server;
  return { ...server, title: local.title, body: local.body, period: local.period, sections: local.sections };
}
