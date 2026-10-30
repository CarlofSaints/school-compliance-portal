// The translation credit price, in one place: the order page (client) and the
// server (pricing, invoices) both read it, so a school is never quoted one
// amount and invoiced another.
export const PAGES_PER_CREDIT = 10;
export const CREDIT_PACK = { credits: 10, rand: 100 };
export const MAX_PACKS = 20;

/** Credits each AI step of "Compile a policy" uses. A change rewrites the whole policy, so it costs as much as the draft. */
export const POLICY_AI_CREDITS = { draft: 2, revise: 2, check: 1 } as const;
