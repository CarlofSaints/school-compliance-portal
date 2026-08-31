"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionPayload } from "./roles";

const SESSION_KEY = "hvps_session";

export function getSession(): SessionPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionPayload;
  } catch {
    return null;
  }
}

export function setSession(payload: SessionPayload): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function updateSession(updates: Partial<SessionPayload>): void {
  const current = getSession();
  if (current) {
    setSession({ ...current, ...updates });
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

// Shown instead of the API's raw "Unauthorized", which reads like "you lack
// permission" when it actually means "you are logged out".
export const SESSION_EXPIRED_MESSAGE =
  "Your session has expired - please log in again.";

export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const session = getSession();
  const headers = new Headers(options.headers);
  if (session?.id) {
    headers.set("x-user-id", session.id);
  }
  const res = await fetch(url, { ...options, headers });

  // A 401 means the server could not resolve a session AT ALL - either no
  // x-user-id reached it, or that id is no longer in the user store. Whatever
  // the cause, the stored session is dead and every further write will fail the
  // same way, so drop it. The next navigation then bounces to /login via
  // useAuth instead of leaving a page that looks fine but cannot save.
  //
  // Deliberately NOT done for 403: that session is valid, it just lacks a
  // permission, and logging the user out over it would be wrong.
  //
  // The login POST uses a bare fetch(), not this, so a failed login never
  // reaches here.
  if (res.status === 401) {
    clearSession();
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
      router.replace("/login");
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
