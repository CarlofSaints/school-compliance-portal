import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { readJson, updateJson, addToList, NO_CHANGE } from "./controlData";
import { authSigningKey } from "./signingKey";
import { tenantScope } from "./tenantContext";
import { getModules } from "./trainingData";
import type { Learner } from "./trainingLearner";

// ---------------------------------------------------------------------------
// Campus share links: a module, lesson or test opened by somebody WITHOUT a
// portal account (Carl, 30 Oct 2026: "share links and emails", no tags,
// anyone may do any training).
//
// Rules carried over from iRam Campus:
// - A link is an entitlement to ONE thing (a module and its pieces, or one
//   piece). The guest gets a separate signed cookie, never a portal session.
// - A guest's name and email are SELF-DECLARED and checked against nothing.
//   Every screen showing a guest's result says "via link".
// - The same email on the same link is the same guest, so a guest who comes
//   back carries on where they left off.
// Guests never appear on the leaderboard (it lists portal users only).
// ---------------------------------------------------------------------------

export type ShareKind = "module" | "material" | "test";

export interface ShareLink {
  token: string;
  kind: ShareKind;
  targetId: string;
  label: string;
  /** YYYY-MM-DD, last day it works; empty = no end. */
  expiresOn: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

export interface Guest {
  id: string;
  token: string;
  name: string;
  surname: string;
  email: string;
  joinedAt: string;
}

const LINKS = "training/share-links.json";
const guestsPath = (token: string) => `training/share-guests/${token}.json`;
export const guestProgressId = (guestId: string) => `guest-${guestId}`;

export const getShareLinks = () => readJson<ShareLink[]>(LINKS, []);

export async function createShareLink(kind: ShareKind, targetId: string, label: string, expiresOn: string, by: string): Promise<ShareLink> {
  const link: ShareLink = {
    token: randomBytes(18).toString("base64url"),
    kind,
    targetId,
    label,
    expiresOn,
    active: true,
    createdBy: by,
    createdAt: new Date().toISOString(),
  };
  await addToList(LINKS, link);
  return link;
}

export async function setShareActive(token: string, active: boolean): Promise<ShareLink | null> {
  let saved: ShareLink | null = null;
  await updateJson<ShareLink[]>(LINKS, [], (list) => {
    const at = list.findIndex((l) => l.token === token);
    if (at < 0) return NO_CHANGE;
    saved = { ...list[at], active };
    const next = [...list];
    next[at] = saved;
    return next;
  });
  return saved;
}

/** Today in South Africa, YYYY-MM-DD. */
const todaySast = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);

/** The link if it can be used today (switched on, not past its last day). */
export async function usableLink(token: string): Promise<ShareLink | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  const link = (await getShareLinks()).find((l) => l.token === token);
  if (!link || !link.active || (link.expiresOn && link.expiresOn < todaySast())) return null;
  return link;
}

/** What the link opens: a module's pieces, or the one piece. */
export async function linkScope(link: ShareLink): Promise<Set<string>> {
  if (link.kind !== "module") return new Set([`${link.kind}:${link.targetId}`]);
  const mod = (await getModules()).find((m) => m.id === link.targetId && m.status === "published");
  return new Set((mod?.items ?? []).map((i) => `${i.kind}:${i.id}`));
}

export const getGuests = (token: string) => readJson<Guest[]>(guestsPath(token), []);

const norm = (s: string) => s.trim().toLowerCase();

/** Joins a guest to a link, or finds them again by email. */
export async function joinGuest(token: string, name: string, surname: string, email: string): Promise<Guest> {
  let guest: Guest | null = null;
  await updateJson<Guest[]>(guestsPath(token), [], (list) => {
    const found = list.find((g) => norm(g.email) === norm(email));
    if (found) {
      guest = found;
      return NO_CHANGE;
    }
    guest = { id: randomUUID(), token, name, surname, email: norm(email), joinedAt: new Date().toISOString() };
    return [...list, guest];
  });
  return guest!;
}

// --- The guest cookie --------------------------------------------------------
// "<token>.<guestId>.<expiry>.<hmac>", signed with the app key AND the school,
// so a cookie made at one school is worthless at another.

// One cookie per link, so a guest on two links keeps both.
const cookieName = (token: string) => `sc_campus_guest_${token}`;
const COOKIE_DAYS = 90;

async function sign(payload: string): Promise<string> {
  const { key } = await tenantScope();
  return createHmac("sha256", authSigningKey()).update(`campus-guest|${key}|${payload}`).digest("base64url");
}

export async function guestCookieValue(token: string, guestId: string): Promise<string> {
  const payload = `${token}.${guestId}.${Date.now() + COOKIE_DAYS * 86_400_000}`;
  return `${payload}.${await sign(payload)}`;
}

export function setGuestCookie(res: NextResponse, token: string, value: string, secure: boolean) {
  res.cookies.set(cookieName(token), value, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: COOKIE_DAYS * 86_400 });
}

/** The guest this request belongs to ON THIS LINK, or null. */
export async function guestFromRequest(req: NextRequest, token: string): Promise<Guest | null> {
  const raw = req.cookies.get(cookieName(token))?.value;
  const parts = raw?.split(".");
  if (!parts || parts.length !== 4) return null;
  const [t, guestId, exp, mac] = parts;
  if (t !== token || !(Number(exp) > Date.now())) return null;
  const want = Buffer.from(await sign(`${t}.${guestId}.${exp}`));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return (await getGuests(token)).find((g) => g.id === guestId) ?? null;
}

/** The learner a guest is on this link: their own progress, only the link's pieces. */
export async function guestLearner(link: ShareLink, guest: Guest): Promise<Learner> {
  return { progressId: guestProgressId(guest.id), manager: false, scope: await linkScope(link) };
}
