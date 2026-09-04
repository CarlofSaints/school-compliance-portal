// ---------------------------------------------------------------------------
// Turning the TWO colours a school actually knows about into the palette the
// portal needs.
//
// Nobody setting up a school knows what a "primary tint for an email subtitle"
// is. They know their main colour and their second colour. Everything else is
// derived here, once, so a school cannot end up with an unreadable button
// because somebody picked the wrong shade on a form.
//
// Pure — no storage, no React. Safe in a client component and in a script.
// ---------------------------------------------------------------------------

export interface DerivedPalette {
  /** Brand main. Buttons, headings, email header. */
  primary: string;
  /** Darker main, for hover. */
  primaryDark: string;
  /** Light tint of main, for email subtitle text on the header. */
  primaryTint: string;
  /** The school's second colour — sidebar brand name, active nav. */
  accent: string;
  /** Near-black for body text and the sidebar. */
  dark: string;
  /** Text colour that is actually READABLE on `primary`. Usually white, but
   *  black for a light brand colour. Without this, a school with a yellow or
   *  pale-blue brand gets white-on-yellow buttons nobody can read. */
  onPrimary: string;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Accepts "#abc", "abc", "#AABBCC". Returns "#aabbcc", or null if it is not a
 *  colour. Never throws — it is fed straight from a form field. */
export function normaliseHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!HEX.test(raw)) return null;
  let hex = raw.replace("#", "").toLowerCase();
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${hex}`;
}

export function hexToRgbTuple(hex: string): [number, number, number] {
  const h = (normaliseHex(hex) || "#000000").slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Mixes toward black (amount < 0) or white (amount > 0), -1..1. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgbTuple(hex);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return toHex(r + (target - r) * t, g + (target - g) * t, b + (target - b) * t);
}

/** Relative luminance, WCAG 2.1. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgbTuple(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Straight-line distance between two colours in RGB, 0 (identical) to ~441
 *  (black vs white). Crude next to a proper perceptual metric, but it answers
 *  the only question asked of it — "are these two the same colour?" — which
 *  contrast ratio cannot, because contrast ignores hue entirely. */
export function colourDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgbTuple(a);
  const [r2, g2, b2] = hexToRgbTuple(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

const WHITE = "#ffffff";
const NEAR_BLACK = "#1a1a1a";

/** Whichever of white or near-black reads better on this background. */
export function readableTextOn(background: string): string {
  return contrastRatio(background, WHITE) >= contrastRatio(background, NEAR_BLACK)
    ? WHITE
    : NEAR_BLACK;
}

export type ColourWarning =
  | { level: "error"; message: string }
  | { level: "warning"; message: string };

/**
 * Says out loud what is wrong with a pair of colours, in words somebody
 * choosing them would understand. Deliberately advisory: a school gets the
 * colours it asks for, and the palette stays readable regardless because
 * onPrimary adapts. This is so they are not surprised by the result.
 */
export function checkColours(
  primaryInput: string,
  accentInput: string
): ColourWarning[] {
  const out: ColourWarning[] = [];
  const primary = normaliseHex(primaryInput);
  const accent = normaliseHex(accentInput);

  if (!primary) {
    out.push({ level: "error", message: "The main colour is not a valid colour." });
  }
  if (!accent) {
    out.push({ level: "error", message: "The second colour is not a valid colour." });
  }
  if (!primary || !accent) return out;

  // The accent sits on the dark sidebar, so that is the contrast that matters
  // for it — not its contrast against white.
  if (contrastRatio(accent, NEAR_BLACK) < 3) {
    out.push({
      level: "warning",
      message:
        "The second colour is very dark, so it will barely show against the dark sidebar. A brighter colour reads better there.",
    });
  }

  // Distance, NOT contrast ratio. Contrast is luminance only, and two colours
  // can have near-identical luminance while being nothing alike — cyan and
  // yellow sit at 1.29:1 and are obviously different colours. Using contrast
  // here told a school its cyan and its yellow were "almost identical".
  if (colourDistance(primary, accent) < 40) {
    out.push({
      level: "warning",
      message:
        "The two colours are almost identical, so the second one will not be noticeable.",
    });
  }

  // Not an error, because onPrimary flips to black and stays readable — but a
  // pale "main" colour makes for a washed-out looking portal, and they should
  // hear that before they see it.
  if (luminance(primary) > 0.6) {
    out.push({
      level: "warning",
      message:
        "The main colour is very light. Buttons will use dark text so they stay readable, but a deeper shade usually looks better.",
    });
  }

  return out;
}

/**
 * The whole palette from the two colours a school gives us.
 *
 * `dark` follows the main colour rather than being a fixed near-black: a school
 * with a black brand (Jeppe) wants a black sidebar, and one with a navy brand
 * wants that navy to carry through instead of clashing with a grey.
 */
export function derivePalette(
  primaryInput: string,
  accentInput: string
): DerivedPalette {
  const primary = normaliseHex(primaryInput) || "#475569";
  const accent = normaliseHex(accentInput) || primary;
  return {
    primary,
    primaryDark: shade(primary, -0.3),
    primaryTint: shade(primary, 0.82),
    accent,
    // Very dark brands keep their own colour; anything else gets the neutral
    // near-black, because a mid-tone sidebar makes white nav text hard work.
    dark: luminance(primary) < 0.08 ? primary : NEAR_BLACK,
    onPrimary: readableTextOn(primary),
  };
}
