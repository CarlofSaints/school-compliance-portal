import { CREDIT_PACK } from "./creditPack";

// ---------------------------------------------------------------------------
// What an Ask Jono answer costs the school. PURE.
//
// Carl: "can it not be more scientific than this? i.e.: it is based on what it
// actually costs us with a mark-up?" So an answer that needs the AI is charged
// its ACTUAL provider cost (from the usage the API reports), converted to rand,
// marked up, in tenths of a credit. Answers found in the Guide without the AI
// are free (lib/jonoFree.ts).
//
// 🔴 The billing pages promise schools are told BEFORE an included feature
// starts costing credits, so charging only starts on JONO_CHARGING_FROM.
// ---------------------------------------------------------------------------

/** The first day (SAST) Jono's AI answers cost credits. */
export const JONO_CHARGING_FROM = "2026-11-16";

/** claude-opus-5-5, USD per million tokens (Anthropic price list, Oct 2026). */
export const PRICE_PER_MTOK = { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 } as const;

// shortcut: a fixed exchange rate; update it when the rand moves far (or read a live rate).
export const USD_TO_ZAR = 19;

/** On top of what the AI costs us: 1.5 = 50%. */
export const JONO_MARKUP = 1.5;

export const RAND_PER_CREDIT = CREDIT_PACK.rand / CREDIT_PACK.credits;

export interface AiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function jonoCharging(now = new Date()): boolean {
  // The SAST date: South Africa is UTC+2 all year.
  const sast = new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
  return sast >= JONO_CHARGING_FROM;
}

/** What one request cost us, in US dollars. Thinking is billed as output. */
export function usdCost(u: AiUsage): number {
  return (
    (u.input_tokens * PRICE_PER_MTOK.input +
      (u.cache_creation_input_tokens ?? 0) * PRICE_PER_MTOK.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * PRICE_PER_MTOK.cacheRead +
      u.output_tokens * PRICE_PER_MTOK.output) /
    1_000_000
  );
}

/** Dollars -> credits charged: rand, marked up, rounded UP to a tenth, at least 0.1. */
export function creditsForUsd(usd: number): number {
  const credits = (usd * USD_TO_ZAR * JONO_MARKUP) / RAND_PER_CREDIT;
  return Math.max(0.1, Math.ceil(credits * 10 - 1e-9) / 10);
}

/**
 * The most an answer can cost, quoted BEFORE it runs: every input token at the
 * dearest input price (a cache WRITE, which a first question pays) and the
 * longest answer allowed. The charge is the actual cost, never more than this.
 */
export function quoteCredits(inputTokens: number, maxOutputTokens: number): number {
  return creditsForUsd(usdCost({ input_tokens: 0, cache_creation_input_tokens: inputTokens, output_tokens: maxOutputTokens }));
}

/** Credits are kept to one decimal, so repeated tenths never drift. */
export const tenth = (n: number) => Math.round(n * 10) / 10;
