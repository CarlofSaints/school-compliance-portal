import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { NO_CHANGE, readJson, updateJson } from "./controlData";
import { requirePermission } from "./rolesData";
import { resolveBranding } from "./brandingData";
import { downloadPolicyFile, getPolicyById, getPolicyVersions } from "./policyData";
import { emptyYear, type Chair, type ChairLine, type Entry, type FileRef, type Signature, type SignLink, type Year } from "./section38a";

// One file per budget year, changed only through updateJson so two admins, or
// an admin and a signing employee, cannot lose each other's work.

const yearPath = (year: number) => `section38a/${year}.json`;
export const filePath = (year: number, kind: "proof" | "letter", f: Pick<FileRef, "ext">) => `section38a/files/${year}/${kind}.${f.ext}`;

export const getYear = (year: number) => readJson<Year>(yearPath(year), emptyYear(year));
export const changeYear = (year: number, change: (y: Year) => Year | typeof NO_CHANGE) => updateJson<Year>(yearPath(year), emptyYear(year), change);

/** The session and the budget year for a logged-in route, or the answer to send. The list holds PERSAL numbers, so it is one narrow key. */
export async function guard(req: NextRequest, param: string) {
  const session = await requirePermission(req, "manage_section_38a");
  if (session instanceof NextResponse) return session;
  if (!/^20\d\d$/.test(param)) return NextResponse.json({ error: "Choose a budget year." }, { status: 400 });
  // s38A binds public schools only.
  if ((await resolveBranding()).schoolType === "private") return NextResponse.json({ error: "Section 38A applies to public schools only." }, { status: 404 });
  return { session, year: Number(param) };
}

export const LOCKED = "This application has been lodged. Undo the lodgement to change it.";

// --- Signing links ---------------------------------------------------------------

const LINK_DAYS = 30;
const hashOf = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** A new link for one signer. The old one stops working. The email is the proof of who: a code sent to the same mailbox would prove nothing more. */
export function mintLink(year: number, target: string, sentBy: { name: string; email: string }): { token: string; link: SignLink } {
  const secret = randomBytes(24).toString("base64url");
  return { token: `${year}.${target}.${secret}`, link: { hash: hashOf(secret), sentAt: new Date().toISOString(), sentBy: sentBy.name, sentByEmail: sentBy.email } };
}

function linkMatches(link: SignLink | undefined, secret: string): boolean {
  if (!link || Date.now() - Date.parse(link.sentAt) > LINK_DAYS * 86_400_000) return false;
  return timingSafeEqual(Buffer.from(link.hash, "hex"), Buffer.from(hashOf(secret), "hex"));
}

export type LinkTarget = { kind: "employee"; entry: Entry } | { kind: "chair"; line: ChairLine; chair: Chair };

/** What a token opens in this copy of the year. Called again inside each write, against the fresh copy. */
export function openLink(y: Year, target: string, secret: string): LinkTarget | null {
  if (target === "sgb" || target === "finance") {
    const chair = y.chairs[target];
    return chair && linkMatches(chair.link, secret) ? { kind: "chair", line: target, chair } : null;
  }
  const entry = y.people.find((e) => e.id === target);
  return entry && linkMatches(entry.link, secret) ? { kind: "employee", entry } : null;
}

export function parseToken(token: string): { year: number; target: string; secret: string } | null {
  const m = /^(20\d\d)\.([\w-]{1,40})\.([\w-]{32})$/.exec(token);
  return m ? { year: Number(m[1]), target: m[2], secret: m[3] } : null;
}

export type SignOutcome = "signed" | "changed" | "locked" | "gone";

/** Puts a signature on what the link opens, if the terms are still the ones the signer saw. */
export async function saveSignature(
  year: number,
  target: string,
  secret: string,
  termsNow: (y: Year, t: LinkTarget) => string,
  seen: unknown,
  signature: Omit<Signature, "terms">
): Promise<SignOutcome> {
  let outcome: SignOutcome = "gone";
  await changeYear(year, (y) => {
    const t = openLink(y, target, secret);
    outcome = !t ? "gone" : y.lodged ? "locked" : termsNow(y, t) !== seen ? "changed" : "signed";
    if (outcome !== "signed" || !t) return NO_CHANGE;
    const signed = { ...signature, terms: seen as string };
    if (t.kind === "chair") return { ...y, chairs: { ...y.chairs, [t.line]: { ...t.chair, signature: signed } } };
    return { ...y, people: y.people.map((e) => (e.id === target ? { ...e, signature: signed, problem: undefined } : e)) };
  });
  return outcome;
}

// --- The policy that goes with the application ---------------------------------

/** The policy's current file. Bytes only when it can go in the pack: a route answer is capped near 4.5 MB. */
export async function policyForPack(policyId: string): Promise<{ name: string; bytes: Buffer | null }> {
  const policy = policyId ? await getPolicyById(policyId) : null;
  if (!policy) return { name: "", bytes: null };
  const file = (await getPolicyVersions(policyId)).find((v) => v.version === policy.currentVersion);
  if (!file || file.ext.toLowerCase() !== "pdf" || file.size > 3 * 1024 * 1024) return { name: policy.name, bytes: null };
  return { name: policy.name, bytes: await downloadPolicyFile(policyId, file.version, file.ext) };
}
