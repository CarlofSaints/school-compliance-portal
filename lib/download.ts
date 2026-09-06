import { authFetch } from "./useAuth";

// ---------------------------------------------------------------------------
// Downloading a file from an authenticated API route.
//
// 🔴 A plain <a href="/api/..."> DOES NOT WORK in this app, and the failure
// looks like a broken feature rather than an auth problem.
//
// Sessions here are carried by an `x-user-id` header that authFetch adds. A
// browser navigation from an anchor sends no such header, so the route answers
// 401 and the person gets a page of JSON reading {"error":"Unauthorized"}.
// Carl hit exactly that clicking "Word" on a set of minutes.
//
// So: fetch it WITH the header, turn the bytes into an object URL, and click a
// synthetic anchor at it. One helper, because this had already been written
// once by hand on the backup page and five more anchors were added without it.
//
// ⚠️ The platform admin pages are the exception and must NOT use this: they are
// server-rendered behind a Clerk COOKIE, which a browser does send, so a plain
// anchor is correct there.
// ---------------------------------------------------------------------------

/** Pulls the filename out of Content-Disposition.
 *
 *  Prefers RFC 6266 `filename*`, because that is the one carrying the real
 *  name: HTTP headers are Latin-1, so the plain `filename` has been stripped
 *  back to ASCII and an accented or em-dashed name arrives mangled there. */
export function filenameFromDisposition(
  header: string | null,
  fallback: string
): string {
  if (!header) return fallback;

  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // A malformed value must not lose the download.
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header) || /filename=([^;]+)/i.exec(header);
  if (plain?.[1]) return plain[1].trim();
  return fallback;
}

export interface DownloadResult {
  ok: boolean;
  /** A sentence to show the person. Empty when it worked. */
  error?: string;
}

/**
 * Downloads `url` using the session header and saves it.
 *
 * Never throws: a failed download must leave a message on screen, not an
 * unhandled rejection in the console where nobody sees it.
 */
export async function downloadWithAuth(
  url: string,
  fallbackName: string
): Promise<DownloadResult> {
  let objectUrl: string | null = null;
  try {
    const res = await authFetch(url);

    if (!res.ok) {
      // The route answers JSON on failure and bytes on success, so the error
      // is readable. Guarded, because a 500 from the platform can be HTML.
      const body = await res.json().catch(() => null);
      return {
        ok: false,
        error:
          body?.error ||
          (res.status === 401
            ? "Your session has expired. Sign in again and retry."
            : `That file could not be downloaded (${res.status}).`),
      };
    }

    const blob = await res.blob();
    if (blob.size === 0) {
      // An empty file saves without complaint and fails to open later, which
      // is a worse outcome than saying so now.
      return { ok: false, error: "That file came back empty." };
    }

    objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filenameFromDisposition(
      res.headers.get("Content-Disposition"),
      fallbackName
    );
    // Appended before clicking: Firefox ignores a click on an anchor that is
    // not in the document.
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return { ok: true };
  } catch {
    return { ok: false, error: "That file could not be downloaded." };
  } finally {
    // Revoked so the blob is not held in memory for the life of the page. Done
    // in finally so an early return cannot leak it.
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
