"use client";

import { useState } from "react";
import { authFetch } from "@/lib/useAuth";
import DownloadLink from "@/components/DownloadLink";
import {
  canOpenSigning,
  signatureMatchesDocument,
  signingProgress,
  SIGNATORY_ROLE_LABELS,
  type MinutesStatus,
  type Signatory,
} from "@/lib/minutes";

// ---------------------------------------------------------------------------
// Signing, from both ends: the secretary who opens it and the person who signs.
//
// The panel stays on the page once the minutes are signed, because the list of
// who signed and when is the record, not a transient step in a workflow.
// ---------------------------------------------------------------------------

interface Props {
  id: string;
  status: MinutesStatus;
  signatories: Signatory[];
  /** A scan of a page signed by hand, where the school went that route. */
  signedCopy?: { filename: string; uploadedAt: string };
  /** The document as it stands now: the full hash to compare each signature
   *  against, and the short form a person can read. Both come from the server,
   *  so the page and the signature cannot disagree about what was signed. */
  currentHash?: string;
  currentRef?: string;
  canManage: boolean;
  myEmail: string;
  onChanged: () => void;
  onToast: (message: string, type: "success" | "error") => void;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MinutesSigningPanel({
  id,
  status,
  signatories,
  signedCopy,
  currentHash,
  currentRef,
  canManage,
  myEmail,
  onChanged,
  onToast,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");

  const me = myEmail.trim().toLowerCase();
  const mine = signatories.find((s) => s.email.trim().toLowerCase() === me);
  const progress = signingProgress(signatories);
  const open = status === "awaiting_signatures";

  async function post(path: string, payload?: unknown, ok?: string) {
    setBusy(true);
    try {
      const res = await authFetch(`/api/minutes/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(data.error || "That did not work.", "error");
        return null;
      }
      if (ok) onToast(ok, "success");
      onChanged();
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function openSigning() {
    const data = await post("open-signing");
    if (!data) return;
    const parts = [`Signing codes sent to ${data.sent} ${data.sent === 1 ? "person" : "people"}.`];
    if (data.failed?.length) parts.push(`Could not reach ${data.failed.join(", ")}.`);
    if (data.withoutEmail?.length)
      parts.push(`No email address for ${data.withoutEmail.join(", ")}, so they cannot sign.`);
    onToast(parts.join(" "), data.failed?.length || data.withoutEmail?.length ? "error" : "success");
  }

  async function sign() {
    const data = await post("sign", { code });
    if (!data) return;
    setCode("");
    onToast(
      data.progress?.complete
        ? "Signed. Everyone has now signed, so the minutes are final and have gone out."
        : `Signed. Still waiting on ${data.progress?.waitingOn?.join(", ") || "the others"}.`,
      "success"
    );
  }

  async function uploadSigned(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      // No Content-Type header: the browser has to set the multipart boundary,
      // and naming the type by hand leaves it off and the body unparseable.
      const res = await authFetch(`/api/minutes/${id}/signed-copy`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(data.error || "Could not upload that file.", "error");
        return;
      }
      onToast("Signed copy uploaded. These minutes are now closed.", "success");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!open && status !== "signed" && !canOpenSigning(status)) return null;

  return (
    <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-sm font-semibold text-dark mb-1">Signing</h2>

      {canOpenSigning(status) && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            Each signatory is emailed their own code. Typing it is what signs the minutes, so
            nobody can sign on somebody else&apos;s behalf.
          </p>
          {canManage && (
            <button
              onClick={openSigning}
              disabled={busy}
              className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              {busy ? "Sending..." : "Send out for signing"}
            </button>
          )}
        </>
      )}

      {/* Carl: "those who prefer a wet ink signature can sign and then upload."
          Offered wherever the minutes are not yet closed, including alongside
          the code route: a school that signs on paper should not have to walk
          through a digital signing round it is not going to use. */}
      {canManage && status !== "signed" && (
        <div className={canOpenSigning(status) ? "mt-5 pt-5 border-t border-gray-100" : ""}>
          <p className="text-sm text-gray-500 mb-2">
            Signed on paper instead? Download the Word file above, sign it, then upload the
            signed page here. That closes the minutes the same way.
          </p>
          <label className="inline-block">
            <input
              type="file"
              accept=".pdf,.doc,.docx,image/*"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Cleared straight away, so choosing the same file twice after
                // a failed upload still fires a change event.
                e.target.value = "";
                if (f) uploadSigned(f);
              }}
              className="hidden"
            />
            <span className="inline-block cursor-pointer px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors">
              {busy ? "Uploading..." : "Upload a signed copy"}
            </span>
          </label>
        </div>
      )}

      {(open || status === "signed") && (
        <>
          {/* Suppressed where nobody signed in the app: a school that signed on
              paper would otherwise be told "0 of 0 signed" about minutes it has
              a signed page for, which reads as a failure. */}
          {signatories.length > 0 && (
            <p className="text-sm text-gray-500 mb-4">
              {progress.signed} of {progress.total} signed
              {progress.waitingOn.length > 0 && `, waiting on ${progress.waitingOn.join(", ")}`}.
            </p>
          )}

          <ul className="space-y-2 mb-4">
            {signatories.map((s) => {
              // 🔴 A signature whose hash no longer matches the document is not
              // stale, it is evidence the record was edited after signing. It
              // is shown rather than quietly recalculated.
              const stale =
                !!s.documentHash && !!currentHash && !signatureMatchesDocument(s, currentHash);
              return (
                <li
                  key={s.email}
                  className="flex flex-wrap items-baseline gap-x-2 text-sm border-l-2 pl-3"
                  style={{ borderColor: s.signedAt ? "#059669" : "#e5e7eb" }}
                >
                  <span className="text-dark font-medium">{s.name}</span>
                  <span className="text-gray-400 text-xs">{SIGNATORY_ROLE_LABELS[s.role]}</span>
                  {s.signedAt ? (
                    <span className="text-emerald-700 text-xs">Signed {when(s.signedAt)}</span>
                  ) : (
                    <span className="text-gray-400 text-xs">
                      {s.codeSentAt ? `Code sent ${when(s.codeSentAt)}` : "No code sent yet"}
                    </span>
                  )}
                  {stale && (
                    <span className="text-xs text-risk-high font-medium">
                      Signed a different version of this document
                    </span>
                  )}
                </li>
              );
            })}
            {signatories.length === 0 && !signedCopy && (
              <li className="text-sm text-gray-400">Nobody has been asked to sign yet.</li>
            )}
          </ul>

          {open && mine && !mine.signedAt && (
            <div className="rounded-lg border border-gray-200 p-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your signing code
              </label>
              <p className="text-xs text-gray-500 mb-2">
                From the email sent to {mine.email}. Signing means you agree these minutes are a
                correct record. They cannot be changed afterwards.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="AB2CD3"
                  maxLength={12}
                  className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition font-mono tracking-widest uppercase w-40"
                />
                <button
                  onClick={sign}
                  disabled={busy || !code.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {busy ? "Signing..." : "Sign these minutes"}
                </button>
                <button
                  onClick={() =>
                    post("open-signing", { resendMine: true }, "A new code is on its way to you.")
                  }
                  disabled={busy}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
                >
                  Send my code again
                </button>
              </div>
            </div>
          )}

          {open && !mine && (
            <p className="text-xs text-gray-400">
              You are not on the signing list for these minutes.
            </p>
          )}

          {signedCopy && (
            <p className="mt-4 text-sm">
              <span className="text-gray-500">Signed on paper: </span>
              <DownloadLink
                href={`/api/minutes/${id}/signed-copy`}
                filename={signedCopy.filename}
                className="text-primary hover:underline font-medium"
                onError={(message) => onToast(message, "error")}
              >
                {signedCopy.filename}
              </DownloadLink>
              <span className="text-gray-400"> uploaded {when(signedCopy.uploadedAt)}</span>
            </p>
          )}

          {currentRef && status === "signed" && (
            <p className="text-xs text-gray-400 mt-4">
              Document reference {currentRef}. This identifies the exact wording that was signed,
              so a later copy can be checked against it.
            </p>
          )}
        </>
      )}
    </div>
  );
}
