// Pure path checks for blob keys. No SDK, no request: so a script can test them.

// 🔴 The SDK turns a key into a URL, and a URL resolves "." and ".." segments
// (also written %2e, also between backslashes, which it reads as slashes, and
// after deleting any tab or newline inside them). Ids come straight from
// request paths (policies/[id], checks/[id]), so one route that forgot to
// validate its id could otherwise reach any other file in the school's store.
// Checked in lib/controlData.ts, once, for every caller. A plain backslash in a
// file name is fine.
export function isUnsafeBlobPath(blobPath: string): boolean {
  // Tab and newline are deleted by the URL parser, so a segment is judged
  // without them; anywhere else they are just part of a file name.
  return blobPath
    .split(/[\\/]/)
    .some((seg) => /^(\.|%2e){1,2}$/i.test(seg.replace(/[\t\n\r]/g, "")));
}

// The backup holds EVERYTHING: every user's password hash, every document.
// That is far more than running the user list, so both backup routes are gated
// on manage_roles (the Super Admin's key), not manage_users (SGB Admins).
export const BACKUP_PERMISSION = "manage_roles";

/** Largest slice the backup file route returns in one response. Vercel caps a
 *  function response at about 4.5MB; a file bigger than this goes in parts. */
export const BACKUP_CHUNK_BYTES = 4_000_000;

/**
 * True when `pathname` (a full blob pathname, as the backup manifest lists it)
 * is a file inside this school's own prefix. The backup file route takes the
 * path from the browser, so this is the trust boundary: anything else is refused.
 */
export function isBackupPathInScope(prefix: string, pathname: unknown): pathname is string {
  if (typeof pathname !== "string" || !prefix.endsWith("/")) return false;
  if (!pathname.startsWith(prefix) || pathname.length === prefix.length) return false;
  // An absolute URL or path would make the SDK fetch it as given, store and all.
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathname) || /^[\\/]/.test(pathname)) return false;
  return !isUnsafeBlobPath(pathname);
}
