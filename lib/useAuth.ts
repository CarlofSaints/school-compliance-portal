"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { SessionPayload } from "./roles";
import { loginUrlFor } from "./nextPath";
import { clearUserBackups, otherTabsUnsaved, SIGNED_OUT_KEY, TAB_ID } from "./minutesBackupKeys";

const SESSION_KEY = "hvps_session";

// getSession() used to JSON.parse on every call, handing back a NEW object each
// time. Anything comparing the session by reference - a hook dependency list,
// or useSyncExternalStore's snapshot - spins forever on that. So cache the
// parse and return the SAME object until the stored string actually changes.
let cachedRaw: string | null = null;
let cachedSession: SessionPayload | null = null;

export function getSession(): SessionPayload | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(SESSION_KEY);
  } catch {
    // Private mode / storage blocked.
    return null;
  }
  if (raw === cachedRaw) return cachedSession;
  cachedRaw = raw;
  try {
    cachedSession = raw ? (JSON.parse(raw) as SessionPayload) : null;
  } catch {
    cachedSession = null;
  }
  return cachedSession;
}

// Subscribers for useSessionValue(). localStorage fires a "storage" event only
// in OTHER tabs, so writes in THIS tab have to announce themselves.
const listeners = new Set<() => void>();

function emitSessionChange(): void {
  listeners.forEach((l) => l());
}

function subscribeSession(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    // e.key is null when the whole store is cleared.
    if (e.key === SESSION_KEY || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

// The session, safe to read DURING render.
//
// Reading localStorage straight from a render body means the server renders one
// thing (no session - there is no localStorage there) and the client renders
// another, which is a hydration mismatch: React throws the server tree away and
// re-renders. useSyncExternalStore handles it properly - the server snapshot is
// null, matching SSR, and the real value arrives right after hydration.
//
// Logging out in one tab now also updates the others.
export function useSessionValue(): SessionPayload | null {
  return useSyncExternalStore(subscribeSession, getSession, () => null);
}

// Leaving the session, so pages holding unsaved work know why they are being
// torn down. Signing out discards that work on purpose (see signOut); a 401
// keeps it in the local backup, to come back after signing in again.
let signingOut = false;
let redirectingToSignIn = false;
const signInRedirectListeners = new Set<() => void>();

/** True from the moment someone asks to sign out until they sign in again. */
export function isSigningOut(): boolean {
  return signingOut;
}

/** True once a 401 has sent this page to sign-in: no "Leave site?" prompt. */
export function isRedirectingToSignIn(): boolean {
  return redirectingToSignIn;
}

/** Runs just before any 401 sends the page to sign-in, whichever request
 *  hit it, e.g. to back up unsaved work. Returns the unsubscribe. */
export function onSignInRedirect(fn: () => void): () => void {
  signInRedirectListeners.add(fn);
  return () => {
    signInRedirectListeners.delete(fn);
  };
}

/** Asked before signing out; false cancels it. A page with unsaved work
 *  tries to save it, and asks the person if that fails. */
const beforeSignOutHooks = new Set<() => Promise<boolean>>();
export function onBeforeSignOut(fn: () => Promise<boolean>): () => void {
  beforeSignOutHooks.add(fn);
  return () => {
    beforeSignOutHooks.delete(fn);
  };
}

/** Runs in THIS tab when the person signs out in another one: a last try at
 *  saving open work before this tab's backups are cleared. */
const signedOutElsewhereHooks = new Set<() => Promise<void>>();
export function onSignedOutElsewhere(fn: () => Promise<void>): () => void {
  signedOutElsewhereHooks.add(fn);
  return () => {
    signedOutElsewhereHooks.delete(fn);
  };
}

// Signing out in one tab tells the others (the storage event fires only in
// OTHER tabs). Each tries one save of open work first: the cookie may not be
// gone yet, and if it is, that save's 401 simply goes to sign-in. Then it
// stops backing up and clears, as the person chose to leave.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === SIGNED_OUT_KEY && e.newValue) {
      const marker = e.newValue;
      void (async () => {
        for (const hook of [...signedOutElsewhereHooks]) await hook().catch(() => {});
        signingOut = true;
        try {
          const { userId } = JSON.parse(marker) as { userId?: string };
          if (userId) clearUserBackups(window.localStorage, window.location.host, userId);
        } catch {
          // A marker we cannot read still stops this tab backing up.
        }
      })();
    } else if (e.key === SESSION_KEY && e.newValue) {
      // Signed in again in another tab.
      signingOut = false;
    }
  });
}

export function setSession(payload: SessionPayload): void {
  signingOut = false;
  redirectingToSignIn = false;
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  emitSessionChange();
}

export function updateSession(updates: Partial<SessionPayload>): void {
  const current = getSession();
  if (current) {
    setSession({ ...current, ...updates });
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  emitSessionChange();
}

/** Signs out: the server clears the cookie, this clears the drawn copy. The
 *  local copy goes even if the call fails, so the page never looks signed in
 *  after the person asked to leave. False when it was cancelled.
 *  confirmOtherTabs is asked when another open tab has recent unsaved minutes
 *  typing (the caller words the question, in the person's language). */
export async function signOut(opts: { confirmOtherTabs?: () => boolean } = {}): Promise<boolean> {
  // Pages with unsaved work in THIS tab get one go at saving it, and may cancel.
  for (const hook of [...beforeSignOutHooks]) {
    if (!(await hook().catch(() => true))) return false;
  }
  // Another tab's (or one closed with typing left in it): it gets its own try
  // at saving when it hears of the sign-out, but cannot ask, so ask here.
  const who = getSession();
  if (who && opts.confirmOtherTabs) {
    let others = 0;
    try {
      others = otherTabsUnsaved(window.localStorage, window.location.host, who.id, TAB_ID);
    } catch {
      // Storage blocked: no backups to find.
    }
    if (others > 0 && !opts.confirmOtherTabs()) return false;
  }
  // 🔴 From here signing out DISCARDS any unsaved minutes typing left: the
  // backups belong to this person, and on a shared computer the next one in
  // must not find them. Flagged BEFORE clearing and before the cookie goes,
  // so a page being torn down neither writes its backup again nor sends a
  // save. (Not on a 401: there the backup is what brings the typing back
  // after signing in again.)
  signingOut = true;
  const me = getSession();
  if (me) {
    try {
      clearUserBackups(window.localStorage, window.location.host, me.id);
      window.localStorage.setItem(SIGNED_OUT_KEY, JSON.stringify({ userId: me.id, at: new Date().toISOString() }));
    } catch {
      // Storage blocked: nothing was backed up.
    }
  }
  try {
    await fetch("/api/auth", { method: "DELETE", credentials: "same-origin" });
  } catch {
    // Offline: the cookie stays until it expires, but this browser shows the
    // sign-in page, which is what was asked for.
  }
  clearSession();
  return true;
}

// Shown instead of the API's raw "Unauthorized", which reads like "you lack
// permission" when it actually means "you are logged out".
export const SESSION_EXPIRED_MESSAGE =
  "Your session has expired - please log in again.";

// The session itself travels in an httpOnly cookie the server set at sign-in
// (lib/session.ts), which the browser attaches to every same-origin request on
// its own. Nothing is added here, and that is the point: the old x-user-id
// header was a value this page chose, and the server believed it.
//
// The copy in localStorage above is only what the pages DRAW (name, menu). It
// grants nothing; the server decides from the cookie alone.
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const res = await fetch(url, { ...options, credentials: "same-origin" });

  // A 401 means the server could not resolve a session AT ALL: no cookie, an
  // expired one, a password changed elsewhere, or the account removed. Every
  // further request will fail the same way, so drop the stored copy and go to
  // sign-in, rather than leaving a page that looks fine but cannot save.
  //
  // Deliberately NOT done for 403: that session is valid, it just lacks a
  // permission, and logging the user out over it would be wrong.
  //
  // The login POST uses a bare fetch(), not this, so a failed login never
  // reaches here.
  if (res.status === 401) {
    redirectingToSignIn = true;
    signInRedirectListeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // One page's backup failing must not stop the redirect.
      }
    });
    clearSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.replace(loginUrlFor(window.location.pathname + window.location.search));
    }
  }
  return res;
}

// The message to show when a request failed. Separates "logged out" (401) from
// a genuine API error so a dead session doesn't surface as a bare "Unauthorized"
// with no hint that logging in again is the fix.
export async function apiErrorMessage(
  res: Response,
  fallback = "Failed"
): Promise<string> {
  if (res.status === 401) return SESSION_EXPIRED_MESSAGE;
  try {
    const data = await res.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

// `requiredPermission` may be a single key or a list, in which case ANY of them
// is enough. A list matters where a new, narrower permission is introduced
// alongside an existing broader one - gating on the new key alone would lock
// out everyone who only holds the old one.
export function useAuth(requiredPermission?: string | string[]) {
  const router = useRouter();
  const [session, setSessionState] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);

  // Depend on the CONTENTS of requiredPermission, never on its identity.
  //
  // Callers pass an inline array - useAuth(["view_users", "manage_users"]) -
  // which is a new array on every render. Putting that straight in the effect's
  // dependencies made the effect re-run every render, and since getSession()
  // JSON.parses a fresh object each call, setSessionState always got a new
  // reference and triggered the next render: an infinite loop. Any page whose
  // own effects depend on `session` then refetched on every iteration, which is
  // what turned a 4-row Users page into a 20-second request storm.
  //
  // Collapsing to a string means the effect re-runs only when the required
  // permissions actually change, and no call site has to remember to useMemo an
  // array literal.
  const permissionKey = Array.isArray(requiredPermission)
    ? requiredPermission.join(",")
    : (requiredPermission ?? "");

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace(loginUrlFor(window.location.pathname + window.location.search));
      return;
    }
    const needed = permissionKey === "" ? [] : permissionKey.split(",");
    if (needed.length > 0 && !needed.some((p) => s.permissions.includes(p))) {
      router.replace("/dashboard");
      return;
    }
    setSessionState(s);
    setLoading(false);
  }, [router, permissionKey]);

  return { session, loading };
}
