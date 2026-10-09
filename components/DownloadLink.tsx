"use client";

import { useState } from "react";
import { downloadWithAuth } from "@/lib/download";

// A link that downloads from an authenticated route.
//
// Deliberately a <button>, not an <a href>. A failed download from an anchor
// shows the person a page of raw JSON; fetching it lets the page say what went
// wrong instead. (It was REQUIRED while the session was an x-user-id header an
// anchor could not send; the session is now a cookie, which it does.)
// Styled to look like a link so nothing changes visually.
//
// Use this for every download from /api/*, EXCEPT on the platform admin pages,
// which sit behind a Clerk cookie the browser does send.
export default function DownloadLink({
  href,
  filename,
  children,
  className = "",
  title,
  onError,
}: {
  href: string;
  /** Used only if the response carries no Content-Disposition. */
  filename: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      title={title}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await downloadWithAuth(href, filename);
          if (!result.ok && result.error) {
            // Surfaced to the caller's toast where there is one. Without this a
            // failed download is completely silent, which reads as a dead
            // button and is what makes it hard to report.
            if (onError) onError(result.error);
            else alert(result.error);
          }
        } finally {
          setBusy(false);
        }
      }}
      className={`${className} disabled:opacity-50 disabled:cursor-wait`}
    >
      {busy ? "Preparing..." : children}
    </button>
  );
}
