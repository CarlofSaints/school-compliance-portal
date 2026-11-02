import Anthropic from "@anthropic-ai/sdk";

/**
 * The AI provider refused because the school's AI account has run out of
 * credit ("Your credit balance is too low to access the Anthropic API").
 * HVPS hit exactly this on 30 Oct 2026. It is NOT the school's own credits
 * (those pay for translation and Compile a policy), so the fix is a top-up
 * of the provider account by whoever runs the portal.
 */
export function isAiOutOfCredit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    (err instanceof Anthropic.APIError && (err.status === 400 || err.status === 402) && /credit balance/i.test(msg)) ||
    /credit balance is too low/i.test(msg)
  );
}
