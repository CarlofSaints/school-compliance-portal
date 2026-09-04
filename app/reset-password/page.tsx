"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";

  // null = still asking the server whether this link is any good.
  const [linkOk, setLinkOk] = useState<boolean | null>(null);
  const [linkError, setLinkError] = useState("");
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Check the link before showing the form. Making somebody choose and confirm
  // a password only to be told the link died an hour ago is the kind of thing
  // that makes people give up and phone somebody.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLinkOk(false);
      setLinkError("That link is missing its token. Please request a new one.");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/auth/reset-password?token=${encodeURIComponent(token)}`
        );
        const data = await res.json();
        if (cancelled) return;
        setLinkOk(!!data.valid);
        setLinkError(data.error || "");
        setEmail(data.email || "");
      } catch {
        if (cancelled) return;
        setLinkOk(false);
        setLinkError("We could not check that link. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not reset your password.");
        return;
      }
      setDone(true);
      // Straight to sign-in rather than logging them in here. The password they
      // just chose is the one thing they should type once to be sure of.
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password changed">
        <div className="bg-green-50 text-green-800 px-4 py-3 rounded-lg mb-6 text-sm">
          Your password has been changed. Taking you to the sign-in page.
        </div>
        <Link
          href="/login"
          className="block w-full text-center bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg font-medium transition-colors"
        >
          Sign in now
        </Link>
      </AuthShell>
    );
  }

  if (linkOk === null) {
    return (
      <AuthShell title="Checking your link">
        <p className="text-sm text-gray-600">One moment...</p>
      </AuthShell>
    );
  }

  if (!linkOk) {
    return (
      <AuthShell title="This link cannot be used">
        <div className="bg-red-50 text-risk-high px-4 py-3 rounded-lg mb-6 text-sm">
          {linkError}
        </div>
        <Link
          href="/forgot-password"
          className="block w-full text-center bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg font-medium transition-colors"
        >
          Send me a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      {email && (
        <p className="text-sm text-gray-600 mb-6">
          Setting a new password for <strong>{email}</strong>.
        </p>
      )}

      {error && (
        <div className="bg-red-50 text-risk-high px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            New password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              minLength={6}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition pr-10"
              placeholder="At least 6 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confirm new password
          </label>
          <input
            type={showPassword ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
            placeholder="Type it again"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Saving..." : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Checking your link">
          <p className="text-sm text-gray-600">One moment...</p>
        </AuthShell>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
