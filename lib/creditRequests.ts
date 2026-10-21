import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { readJson, writeJson, updateJson, listFiles, deleteFile, NO_CHANGE } from "./controlData";
import { addCredits } from "./contentTranslation";
import { CREDIT_PACK } from "./creditPack";
export { MAX_PACKS } from "./creditPack";

// ---------------------------------------------------------------------------
// Buying translation credits by EFT, the same way schools already buy the
// portal while PayFast is not set up: the school asks, School Compliance
// invoices, the school pays, and only then are the credits added.
//
// The school asks on Admin > Translation Credits. Carl gets an email with a
// "Payment received: add the credits" button; the link carries a one-time
// secret, and only its sha256 is stored, so the link IS the authority and
// exists in Carl's inbox and nowhere else. It works the same on HVPS and
// Jeppe, which have no /platform page.
//
// 🔴 Nothing is added on request. A request is a promise to pay.
// ---------------------------------------------------------------------------

// Payment can take a school finance office a while.
const LINK_DAYS = 90;

export interface CreditRequest {
  id: string;
  packs: number;
  credits: number;
  amountRand: number;
  reference: string;
  requestedBy: { id: string; name: string; email: string };
  requestedAt: string;
  status: "pending" | "approved";
  approvedAt?: string;
  tokenHash: string;
  // Random per write: see the "OUR write may be the one" note in updateJson. Two approvals of one link
  // must not both win the claim and both add the credits.
  rev?: string;
}

const path = (id: string) => `translations/credit-requests/${id}.json`;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** The request as stored, and the raw token for the approve link (never stored). */
export async function createCreditRequest(input: {
  packs: number;
  reference: string;
  requestedBy: CreditRequest["requestedBy"];
}): Promise<{ request: CreditRequest; token: string }> {
  const token = randomBytes(32).toString("base64url");
  const request: CreditRequest = {
    id: randomBytes(9).toString("base64url"),
    packs: input.packs,
    credits: input.packs * CREDIT_PACK.credits,
    amountRand: input.packs * CREDIT_PACK.rand,
    reference: input.reference,
    requestedBy: input.requestedBy,
    requestedAt: new Date().toISOString(),
    status: "pending",
    tokenHash: hash(token),
  };
  await writeJson(path(request.id), request);
  return { request, token };
}

function tokenMatches(request: CreditRequest, token: string): boolean {
  const a = Buffer.from(request.tokenHash, "hex");
  const b = Buffer.from(hash(token), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const expired = (r: CreditRequest) =>
  Date.now() - new Date(r.requestedAt).getTime() > LINK_DAYS * 86_400_000;

/** For the approve page: the request behind a link, or why the link is no good. */
export async function requestForLink(
  id: string,
  token: string
): Promise<{ request: CreditRequest } | { error: string }> {
  const request = /^[\w-]{1,40}$/.test(id) ? await readJson<CreditRequest | null>(path(id), null) : null;
  if (!request || !tokenMatches(request, token)) return { error: "This link is not valid." };
  if (request.status === "approved") return { request };
  if (expired(request)) return { error: "This link has expired. Ask the school to request the credits again." };
  return { request };
}

/**
 * Adds the credits for a paid request, once. The request is marked approved
 * BEFORE the credits go on, so two clicks cannot add them twice; if adding
 * then fails, the mark is undone so the link can be used again.
 */
export async function approveCreditRequest(
  id: string,
  token: string
): Promise<{ ok: true; request: CreditRequest; balance: number } | { ok: false; status: number; error: string }> {
  const found = await requestForLink(id, token);
  if ("error" in found) return { ok: false, status: 404, error: found.error };
  if (found.request.status === "approved") {
    return { ok: false, status: 409, error: "These credits were already added." };
  }

  let claimed: CreditRequest | null = null;
  await updateJson<CreditRequest | null>(path(id), null, (r) => {
    if (!r || r.status !== "pending") return NO_CHANGE;
    claimed = { ...r, status: "approved", approvedAt: new Date().toISOString(), rev: randomBytes(8).toString("hex") };
    return claimed;
  });
  if (!claimed) return { ok: false, status: 409, error: "These credits were already added." };
  const request: CreditRequest = claimed;

  try {
    const { balance } = await addCredits(request.credits);
    return { ok: true, request, balance };
  } catch (err) {
    console.error("[credits] could not add credits for request", id, err);
    await updateJson<CreditRequest | null>(path(id), null, (r) =>
      r ? { ...r, status: "pending", approvedAt: undefined } : NO_CHANGE
    ).catch((e) => console.error("[credits] 🔴 could not reopen request", id, e));
    return { ok: false, status: 502, error: "The credits could not be added just now. Please try the link again." };
  }
}

/** Takes back a request whose order email never went out: nobody holds its
 *  link, so it could only ever sit there unapprovable. */
export async function withdrawCreditRequest(id: string): Promise<void> {
  await deleteFile(path(id));
}

/** Requests still waiting for payment, newest first, for the credits page.
 *  shortcut: reads every request ever made; fine for a few orders a year per
 *  school, move approved ones to their own folder if that ever grows. */
export async function pendingCreditRequests(): Promise<Omit<CreditRequest, "tokenHash">[]> {
  const names = (await listFiles("translations/credit-requests")).filter((n) => n.endsWith(".json"));
  const all = await Promise.all(
    names.map((n) => readJson<CreditRequest | null>(`translations/credit-requests/${n}`, null))
  );
  return all
    .filter((r): r is CreditRequest => !!r && r.status === "pending" && !expired(r))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .map(({ tokenHash: _, ...r }) => r);
}
