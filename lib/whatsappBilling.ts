import { RAND_PER_CREDIT, USD_TO_ZAR } from "@/lib/jonoBilling";

// What a WhatsApp reminder costs a school, in credits. Carl, 13 Nov 2026:
// "figure out what a message costs ... I only want 25% margin".
//
// Every reminder is a Meta "utility" template. Meta charges per DELIVERED
// message, so the school is charged on the delivered receipt, not on send.

/** Meta list rate, South Africa, utility, per delivered message (rate card from 1 Oct 2026; was 0.0076). */
export const WA_USD_PER_MESSAGE = 0.0095;
/** Margin on the selling price (not markup): price = cost / (1 - margin). */
export const WA_MARGIN = 0.25;
/** OuterJoin is VAT-registered (Carl, 13 Nov 2026): credit packs ("R100 for 10
 *  credits") are VAT-inclusive, so 15% of every credit goes to SARS. Meta's VAT
 *  is claimed back, so the cost is ex-VAT. The margin is on the ex-VAT price. */
export const VAT = 0.15;

/** Rand (incl. VAT) a school pays per delivered message: R0.2768 at R19/$. */
export function waRandPerMessage(): number {
  return ((WA_USD_PER_MESSAGE * USD_TO_ZAR) / (1 - WA_MARGIN)) * (1 + VAT);
}

/**
 * Credits are kept to tenths (R1), and one message is ~R0.28, so a per-message
 * charge would round to nothing or to 4x the price. Instead each school keeps
 * a carried rand amount: delivered messages add to it, and every whole tenth
 * of a credit in it is taken off the balance. Exactly 25% margin, no rounding gift.
 */
export function waMeter(carryRand: number, delivered: number): { credits: number; carryRand: number } {
  const owed = carryRand + delivered * waRandPerMessage();
  const credits = Math.floor((owed / RAND_PER_CREDIT) * 10 + 1e-9) / 10;
  return { credits, carryRand: Math.round((owed - credits * RAND_PER_CREDIT) * 1e6) / 1e6 };
}
