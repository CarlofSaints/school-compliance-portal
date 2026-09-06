"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useBranding } from "@/components/BrandingProvider";
import SchoolCrest from "@/components/SchoolCrest";
import SignaturePad from "@/components/SignaturePad";
import Toast from "@/components/Toast";
import {
  formatPeriod,
  numberedTitle,
  sectionNumbers,
  signingProgress,
  signatureMatchesDocument,
  MEETING_BODY_LABELS,
  SIGNATORY_ROLE_LABELS,
  type MeetingBody,
  type MeetingPeriod,
  type MinutesSection,
  type MinutesStatus,
  type Signatory,
} from "@/lib/minutes";

// ---------------------------------------------------------------------------
// Read the document, then sign it.
//
// Carl: "i did expect the document to open in browser and then the user can
// sign as though they might on Adobe or SignNow or QuicklySign."
//
// The page renders the same thing the Word file contains, in the same order,
// because somebody signing has to be able to see what they are agreeing to.
// A signing button on a list row asks people to sign a filename.
// ---------------------------------------------------------------------------

interface Detail {
  id: string;
  title: string;
  body: MeetingBody;
  period: MeetingPeriod;
  status: MinutesStatus;
  sections: MinutesSection[];
  signatories: Signatory[];
  draftNumber: number;
  documentHash?: string;
  documentRef?: string;
  signedAt?: string;
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

export default function SignMinutesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session, loading } = useAuth();
  const branding = useBranding();

  const [record, setRecord] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(true);
  const [signing, setSigning] = useState(false);
  const [code, setCode] = useState("");
  const [mark, setMark] = useState<{ dataUrl: string; kind: "drawn" | "typed" } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await authFetch(`/api/minutes/${params.id}`);
      if (res.ok) setRecord(await res.json());
    } finally {
      setBusy(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  if (loading || !session) return null;
  if (busy) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!record) return <div className="p-6 text-gray-400">Not found.</div>;

  const me = session.email.trim().toLowerCase();
  const mine = record.signatories.find((s) => s.email.trim().toLowerCase() === me);
  const progress = signingProgress(record.signatories);
  const numbers = sectionNumbers(record.sections);
  const ordered = [...record.sections].sort((a, b) => a.order - b.order);
  const open = record.status === "awaiting_signatures";

  async function sign() {
    if (!mark) return;
    setSigning(true);
    try {
      const res = await authFetch(`/api/minutes/${record!.id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, signature: mark.dataUrl, kind: mark.kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ message: data.error || "Could not sign these minutes.", type: "error" });
        return;
      }
      setCode("");
      setMark(null);
      setToast({
        message: data.progress?.complete
          ? "Signed. Everyone has now signed, so the minutes are final and have gone out."
          : `Signed. Still waiting on ${data.progress?.waitingOn?.join(", ") || "the others"}.`,
        type: "success",
      });
      load();
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <Link
        href={`/minutes/${record.id}`}
        className="text-sm text-gray-500 hover:text-primary"
      >
        Back to these minutes
      </Link>

      {/* The document. Deliberately white on grey with a page-like width: it
          should look like the thing being signed, not like another form. */}
      <div className="mt-3 bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-12">
        <div className="text-center border-b border-gray-200 pb-6 mb-6">
          <SchoolCrest width={72} height={72} className="mx-auto mb-3 h-16 w-auto" />
          <h1 className="text-xl font-bold text-dark uppercase tracking-wide">
            {branding.fullName}
          </h1>
          <p className="text-gray-600 mt-2 font-medium">
            Minutes of the {MEETING_BODY_LABELS[record.body]} meeting
          </p>
          <p className="text-gray-500 text-sm">{formatPeriod(record.period)}</p>
          <p className="text-dark font-medium mt-2">{record.title}</p>
          {record.status !== "signed" && record.draftNumber > 0 && (
            <p className="mt-3 inline-block text-xs font-bold tracking-widest text-risk-high border border-risk-high rounded px-2 py-0.5">
              DRAFT {record.draftNumber}
            </p>
          )}
        </div>

        {/* The same three columns as the Word file, so what somebody signs on
            screen is what comes out of the printer. */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left py-2 px-3 w-12 bg-gray-50 border border-gray-200 font-semibold">
                No.
              </th>
              <th className="text-left py-2 px-3 bg-gray-50 border border-gray-200 font-semibold">
                Item
              </th>
              <th className="text-left py-2 px-3 w-40 bg-gray-50 border border-gray-200 font-semibold">
                Responsible
              </th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((s) => (
              <tr key={s.id} className="align-top">
                <td className="py-2 px-3 border border-gray-200 text-gray-500">
                  {numbers.get(s.id) ?? ""}
                </td>
                <td className="py-2 px-3 border border-gray-200">
                  <p className="font-medium text-dark">{numberedTitle(s.title, null)}</p>
                  {s.body?.trim() ? (
                    <p className="text-gray-700 whitespace-pre-wrap mt-1">{s.body}</p>
                  ) : (
                    // Shown, not skipped: a reader cannot otherwise tell "not
                    // discussed" from "we left it out".
                    <p className="text-gray-400 italic mt-1">Nothing recorded</p>
                  )}
                </td>
                <td className="py-2 px-3 border border-gray-200 text-gray-700">
                  {s.responsible || ""}
                </td>
              </tr>
            ))}
            {ordered.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-gray-400 border border-gray-200">
                  These minutes have no sections yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h2 className="text-sm font-semibold text-dark mt-10 mb-4 uppercase tracking-wide">
          Signatures
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {record.signatories.map((s) => {
            const stale =
              !!s.documentHash &&
              !!record.documentHash &&
              !signatureMatchesDocument(s, record.documentHash);
            return (
              <div key={s.email}>
                <div className="h-20 border-b border-gray-400 flex items-end">
                  {s.signedAt ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/minutes/${record.id}/signature/${encodeURIComponent(s.email)}`}
                      alt={`Signed by ${s.name}`}
                      className="max-h-20 w-auto"
                    />
                  ) : null}
                </div>
                <p className="text-sm font-medium text-dark mt-1">{s.name}</p>
                <p className="text-xs text-gray-500">{SIGNATORY_ROLE_LABELS[s.role]}</p>
                {s.signedAt ? (
                  <p className="text-xs text-emerald-700 mt-1">Signed {when(s.signedAt)}</p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">Not yet signed</p>
                )}
                {stale && (
                  <p className="text-xs text-risk-high font-medium mt-1">
                    Signed a different version of this document
                  </p>
                )}
              </div>
            );
          })}
          {record.signatories.length === 0 && (
            <p className="text-sm text-gray-400">Nobody has been asked to sign yet.</p>
          )}
        </div>

        {record.documentRef && (
          <p className="text-xs text-gray-400 mt-8">
            Document reference {record.documentRef}. This identifies the exact wording above, so
            a later copy can be checked against it.
          </p>
        )}
      </div>

      {/* Signing sits UNDER the document, not beside it: you scroll past what
          you are agreeing to before you can agree to it. */}
      {open && mine && !mine.signedAt && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <h2 className="text-sm font-semibold text-dark">Sign as {mine.name}</h2>
          <p className="text-sm text-gray-500 mt-1 mb-5">
            Signing means you agree the minutes above are a correct record. Once everyone has
            signed they are locked and cannot be changed.
          </p>

          <SignaturePad name={mine.name} onChange={setMark} />

          <div className="mt-6 pt-5 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your signing code
            </label>
            <p className="text-xs text-gray-500 mb-2">
              From the email sent to {mine.email}. It is what proves the signature is yours.
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
                disabled={signing || !mark || !code.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
              >
                {signing ? "Signing..." : "Sign these minutes"}
              </button>
            </div>
            {/* Says which half is missing. "Sign" being greyed out with no
                explanation is the commonest way a form wastes somebody's time. */}
            {(!mark || !code.trim()) && (
              <p className="text-xs text-gray-400 mt-2">
                {!mark && !code.trim()
                  ? "Draw or type your signature, then enter your code."
                  : !mark
                    ? "Draw or type your signature above."
                    : "Enter the code from your email."}
              </p>
            )}
          </div>
        </div>
      )}

      {open && mine?.signedAt && (
        <div className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          You signed these minutes on {when(mine.signedAt)}.{" "}
          {progress.waitingOn.length > 0
            ? `Still waiting on ${progress.waitingOn.join(", ")}.`
            : ""}
        </div>
      )}

      {open && !mine && (
        <div className="mt-6 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
          You are not on the signing list for these minutes, so there is nothing for you to sign.
        </div>
      )}

      {record.status === "signed" && (
        <div className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          These minutes are signed and final
          {record.signedAt &&
            ` as of ${new Date(record.signedAt).toLocaleDateString("en-ZA", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}`}
          .
        </div>
      )}

      {!open && record.status !== "signed" && (
        <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          These minutes are not out for signing yet.{" "}
          <button
            onClick={() => router.push(`/minutes/${record.id}`)}
            className="underline hover:no-underline"
          >
            Back to the minutes
          </button>
          .
        </div>
      )}
    </div>
  );
}
