"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { getSession, updateSession } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";

// Where the "Confirm my new email" link lands (lib/emailChange.ts).
//
// 🔴 Asks for a click instead of confirming on arrival. Mail scanners open the
// links in a message by themselves, and one that confirmed on page load would
// change the address before the person had seen the email.
function ConfirmEmail() {
  const t = useT();
  const token = useSearchParams().get("token") || "";
  const [state, setState] = useState<"ready" | "working" | "done" | "failed">(token ? "ready" : "failed");
  const [message, setMessage] = useState(token ? "" : t("That link is missing its token."));
  const [email, setEmail] = useState("");

  const confirm = async () => {
    setState("working");
    try {
      const res = await fetch("/api/account/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || t("That did not work. Please try again."));
        setState("failed");
        return;
      }
      setEmail(data.email || "");
      // If this browser is signed in AS THAT PERSON, show the new address
      // straight away. A link opened in someone else's signed-in browser must
      // not relabel their session.
      if (getSession()?.id === data.userId) updateSession({ email: data.email });
      setState("done");
    } catch {
      setMessage(t("We could not reach the portal. Please try again."));
      setState("failed");
    }
  };

  if (state === "done") {
    return (
      <AuthShell title={t("Email address changed")}>
        <p className="text-sm text-gray-600 mb-6">
          {t("From now on you sign in with")} <strong>{email}</strong>.
        </p>
        <Link
          href="/login"
          className="block w-full text-center bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg font-medium transition-colors"
        >
          {t("Go to sign in")}
        </Link>
      </AuthShell>
    );
  }

  if (state === "failed") {
    return (
      <AuthShell title={t("This link cannot be used")}>
        <div className="bg-red-50 text-risk-high px-4 py-3 rounded-lg mb-6 text-sm">{message}</div>
        <Link
          href="/account"
          className="block w-full text-center bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg font-medium transition-colors"
        >
          {t("Go to My Account")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("Confirm your new email")}>
      <p className="text-sm text-gray-600 mb-6">
        {t("Press the button to make this address the one you sign in with.")}
      </p>
      <button
        onClick={confirm}
        disabled={state === "working"}
        className="w-full bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state === "working" ? t("Confirming...") : t("Confirm my new email")}
      </button>
    </AuthShell>
  );
}

export default function ConfirmEmailPage() {
  const t = useT();
  return (
    <Suspense
      fallback={
        <AuthShell title={t("Confirm your new email")}>
          <p className="text-sm text-gray-600">{t("One moment...")}</p>
        </AuthShell>
      }
    >
      <ConfirmEmail />
    </Suspense>
  );
}
