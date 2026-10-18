// Where to send someone after sign-in, so a link from an email (a room request,
// say) still lands where it pointed once they have logged in.
//
// 🔴 Only a same-origin RELATIVE path is accepted: it must start with one "/",
// not "//" or "/\" (both read as another host), carry no control characters,
// and resolve to this origin. Anything else is ignored, so ?next= cannot be
// used to bounce a fresh sign-in to another site.

const BASE = "http://same.origin";

export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null;
  try {
    if (new URL(raw, BASE).origin !== BASE) return null;
  } catch {
    return null;
  }
  // Back to the sign-in page itself would loop.
  if (raw === "/login" || raw.startsWith("/login?") || raw.startsWith("/login/")) return null;
  return raw;
}

/** The sign-in URL that returns to `path` afterwards. */
export function loginUrlFor(path: string): string {
  const next = safeNextPath(path);
  return next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";
}
