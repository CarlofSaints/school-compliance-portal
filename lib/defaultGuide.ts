import type { SchoolBranding } from "./branding";
import type { Locale } from "./i18n/locales";
import { GUIDE_TEXT } from "./guideText";
import { dictFor } from "./i18n/server";
import { makeT } from "./i18n/translate";

// ---------------------------------------------------------------------------
// The guide every school starts with.
//
// Carl: "every school needs a guide. why dont we use our main branding to
// produce a generic one that can be used for all new sites?"
//
// 🔴 TEXT ONLY, no screenshots, and that is not a shortcut. The guide HVPS
// published carries 19 embedded screenshots of a real school: names off its
// governance register, its project names and its CAPEX figures. Serving that
// as the default for every new school would leak one school's records into
// every other one, which is the same mistake as the crest fallback and with
// far worse contents.
//
// Generated from the school's own branding rather than shipped as a fixed
// file, so it names the school reading it and follows its colours.
//
// A school that publishes its own guide overrides this entirely. This is the
// floor, not a ceiling.
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The how-to clips (components/GuideVideo, public/tutorials) for each chapter,
// IN CHAPTER ORDER, with the English title so scripts/check-default-guide.ts
// catches a chapter added or moved: [clip id, the menu label it is named by].
// The labels are the sidebar's, so every language already has them.
export const CHAPTER_VIDEOS: [chapter: string, clips: [id: string, label: string][]][] = [
  ["Getting in", []],
  ["Finding your way around", [["dashboard", "Dashboard"]]],
  ["Reading the portal in your language", [["translation-credits", "Translation Credits"]]],
  ["Our People", [["people", "People"], ["people-positions", "People & Positions"], ["people-types", "People Types"]]],
  ["Policies", [["policies", "Policies"], ["policy-categories", "Policy Categories"], ["documents", "Documents"]]],
  ["Running a compliance check", [["compliance", "Run Check"], ["guidelines", "Guidelines"]]],
  ["Applying for funds", [["spend", "Spend"]]],
  ["Approving spend", [["approval-settings", "Approval Settings"], ["spend-settings", "Spend Settings"]]],
  ["The budget and spend reports", [["spend-reports", "Reports"]]],
  ["Writing the minutes", [["minutes", "Meeting Minutes"], ["minutes-admin", "Minutes Admin"]]],
  ["Sending a draft out for checking", []],
  ["Signing the minutes", [["signing", "Read and sign"]]],
  ["Action items", [["action-items", "Action Items"], ["action-categories", "Action Categories"]]],
  ["Booking a meeting room", [["bookings", "Bookings"], ["rooms", "Meeting Rooms"]]],
  ["Keeping everyone informed", [["weekly-update", "Weekly Update"], ["action-summary", "Action Summary Email"]]],
  ["People, users and tags", [["users", "Users"], ["roles", "Roles"], ["tags", "Tags"]]],
  ["Making it look like your school", [["branding", "School Branding"]]],
  ["Keeping a record", [["activity", "Activity Log"], ["sent-emails", "Sent Emails"], ["backup", "Backup Data"]]],
  ["Emails the portal sends", []],
];

/**
 * The standard guide, built for one school.
 *
 * A complete standalone HTML document, because that is what the Guide page
 * renders: it is handed to a sandboxed iframe, so it has to bring its own
 * stylesheet rather than inherit the portal's.
 */
export function buildDefaultGuide(branding: SchoolBranding, locale: Locale, origin: string): string {
  const school = branding.fullName;
  // shortcut: schoolType comes from the deployment's code branding, so a
  // private school on the SHARED deployment still reads "SGB" until a school
  // can store its own type.
  const body = branding.schoolType === "private" ? "Board" : "SGB";
  const primary = branding.colors.primary;
  const dark = branding.colors.dark;
  // Carl, 26 Oct: "nothing in the guide translates when i switch languages".
  const text = GUIDE_TEXT[locale] ?? GUIDE_TEXT.en;
  const list = text.chapters(esc(school), body);
  const t = makeT(dictFor(locale));
  // Absolute: the guide is shown from a blob: URL, where "/tutorials/..." resolves to nothing.
  const watch = (i: number) => {
    const clips = CHAPTER_VIDEOS[i]?.[1] ?? [];
    if (!clips.length) return "";
    const links = clips.map(
      ([id, label]) => `<a href="${esc(origin)}/tutorials/${id}.mp4" target="_blank" rel="noopener">&#9654; ${esc(t(label))}</a>`
    );
    return `<p class="watch">${esc(t("Watch how"))}: ${links.join(" &middot; ")}</p>`;
  };

  const contents = list
    .map(
      (c, i) =>
        `<li><a href="#ch${String(i + 1).padStart(2, "0")}"><span class="n">${String(
          i + 1
        ).padStart(2, "0")}</span><span class="t">${esc(c.title)}</span></a></li>`
    )
    .join("");

  const sections = list
    .map(
      (c, i) => `
<section class="chapter" id="ch${String(i + 1).padStart(2, "0")}">
  <div class="chead">
    <span class="num">${esc(text.chapter)} ${String(i + 1).padStart(2, "0")}</span>
    <h2>${esc(c.title)}</h2>
  </div>
  ${watch(i)}
  ${c.html}
</section>`
    )
    .join("");

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(school)} ${esc(text.title)}</title>
<style>
  :root { --primary: ${primary}; --dark: ${dark}; --ink: #1a1a1a; --soft: #666; --rule: #e5e5e5; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.65 Inter, -apple-system, Segoe UI, Roboto, sans-serif; color: var(--ink); background: #fff; }
  .masthead { background: var(--dark); color: #fff; padding: 48px 32px; }
  .masthead-in { max-width: 820px; margin: 0 auto; }
  .crest { margin: 0 0 8px; font-size: 13px; letter-spacing: .18em; text-transform: uppercase; opacity: .7; }
  .masthead h1 { margin: 0 0 12px; font-size: 34px; line-height: 1.15; }
  .standfirst { margin: 0; opacity: .85; max-width: 60ch; }
  .stamp { margin-top: 24px; display: flex; flex-wrap: wrap; gap: 20px; font-size: 13px; opacity: .75; }
  .shell { max-width: 1100px; margin: 0 auto; display: flex; gap: 40px; padding: 40px 32px 80px; align-items: flex-start; }
  .rail { position: sticky; top: 24px; width: 250px; flex-shrink: 0; }
  .rail h2 { font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--soft); margin: 0 0 12px; }
  .rail ol { list-style: none; margin: 0; padding: 0; }
  .rail a { display: flex; gap: 10px; padding: 6px 0; text-decoration: none; color: var(--ink); font-size: 14px; border-bottom: 1px solid var(--rule); }
  .rail a:hover { color: var(--primary); }
  .rail .n { color: var(--soft); font-variant-numeric: tabular-nums; }
  main { flex: 1; min-width: 0; }
  .chapter { padding-bottom: 40px; margin-bottom: 40px; border-bottom: 1px solid var(--rule); }
  .chapter:last-child { border-bottom: 0; }
  .chead .num { font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--primary); }
  .chead h2 { margin: 6px 0 16px; font-size: 26px; }
  .lede { font-size: 18px; color: #333; }
  .watch { font-size: 14px; color: var(--soft); } .watch a { color: var(--primary); white-space: nowrap; }
  h3 { margin: 28px 0 8px; font-size: 17px; }
  .ui { background: #f2f2f2; border: 1px solid var(--rule); border-radius: 4px; padding: 1px 6px; font-size: 14px; white-space: nowrap; }
  .steps { padding-left: 20px; } .steps li { margin: 8px 0; }
  ul li { margin: 6px 0; }
  .note, .careful { border-radius: 8px; padding: 14px 16px; margin: 20px 0; }
  .note { background: #f6f8fa; border-left: 3px solid var(--primary); }
  .careful { background: #fff8f1; border-left: 3px solid #d97706; }
  .lbl { display: block; font-weight: 600; font-size: 14px; margin-bottom: 4px; }
  .note p, .careful p { margin: 0; font-size: 15px; }
  .tw { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 15px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--rule); vertical-align: top; }
  th { color: var(--soft); font-size: 13px; text-transform: uppercase; letter-spacing: .06em; }
  @media print { .rail { display: none; } .shell { display: block; } .chapter { break-inside: avoid; } }
  @media (max-width: 820px) { .shell { flex-direction: column; } .rail { position: static; width: auto; } }
</style>
</head>
<body>
<header class="masthead">
  <div class="masthead-in">
    <p class="crest">${esc(school)} · ${body}</p>
    <h1>${esc(text.title)}</h1>
    <p class="standfirst">${esc(text.standfirst)}</p>
    <div class="stamp">
      <span><b>${esc(text.edition)}</b> ${esc(text.standard)}</span>
      <span><b>${esc(text.covers(list.length))}</b></span>
    </div>
  </div>
</header>
<div class="shell">
  <nav class="rail" aria-label="${esc(text.contents)}"><h2>${esc(text.contents)}</h2><ol>${contents}</ol></nav>
  <main>${sections}</main>
</div>
</body>
</html>`;
}
