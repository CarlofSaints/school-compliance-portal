// The words of the standard guide, one file per language (lib/guideText/<code>.ts).
// The page layout and styles live in lib/defaultGuide.ts and are shared.

export interface Chapter {
  title: string;
  /** HTML. Keep the tags and class names exactly as in en.ts. */
  html: string;
}

export interface GuideText {
  /** "Portal Guide" */
  title: string;
  /** The paragraph under the title. */
  standfirst: string;
  /** "Chapter", shown as "Chapter 03". */
  chapter: string;
  contents: string;
  edition: string;
  standard: string;
  /** "Covers 20 chapters" */
  covers: (n: number) => string;
  /**
   * `school` is the school's full name, ALREADY HTML-escaped.
   * `body` is the short name of its governing body ("SGB" or "Board").
   */
  chapters: (school: string, body: string) => Chapter[];
}
