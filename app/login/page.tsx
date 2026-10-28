"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SchoolCrest from "@/components/SchoolCrest";
import { setSession, getSession } from "@/lib/useAuth";
import { useBranding } from "@/components/BrandingProvider";
import { useT } from "@/components/I18nProvider";
import { safeNextPath, passwordChangeUrl } from "@/lib/nextPath";

// Where an emailed link (e.g. a room request) was heading before sign-in.
function nextOrDashboard(): string {
  return safeNextPath(new URLSearchParams(window.location.search).get("next")) ?? "/dashboard";
}

export default function LoginPage() {
  const branding = useBranding();
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Super Admin second step: "code" (app set up) or "setup" (first time).
  const [mfa, setMfa] = useState<null | { step: "code" | "setup"; token: string; secret?: string; qrSvg?: string }>(null);
  const [code, setCode] = useState("");
  // Shown once after set-up, before going in.
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [afterCodes, setAfterCodes] = useState<(() => void) | null>(null);

  useEffect(() => {
    const s = getSession();
    if (s) router.replace(nextOrDashboard());
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("Login failed"));
        return;
      }
      if (data.mfa) {
        setMfa({ step: data.mfa, token: data.mfaToken, secret: data.secret, qrSvg: data.qrSvg });
        setCode("");
        return;
      }
      signedIn(data);
    } catch {
      setError(t("Network error. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const signedIn = (data: { session: Parameters<typeof setSession>[0]; forcePasswordChange?: boolean }) => {
    setSession(data.session);
    if (data.forcePasswordChange) {
      // The emailed link (?next=) survives the forced password change.
      router.push(passwordChangeUrl(new URLSearchParams(window.location.search).get("next")));
    } else {
      router.push(nextOrDashboard());
    }
  };

  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfa) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfaToken: mfa.token, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("Login failed"));
        if (data.restart) setMfa(null);
        return;
      }
      if (data.backupCodes) {
        setBackupCodes(data.backupCodes);
        setAfterCodes(() => () => signedIn(data));
        return;
      }
      if (typeof data.backupLeft === "number" && data.backupLeft <= 3) {
        alert(t("You have {n} backup codes left. Ask another Super Admin to reset your two-step sign-in so you get new ones.", { n: data.backupLeft }));
      }
      signedIn(data);
    } catch {
      setError(t("Network error. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <SchoolCrest width={100} height={120} className="mx-auto mb-4" priority />
          <h1 className="text-2xl font-bold text-dark">
            {branding.fullName}
          </h1>
          <p className="text-gray-500 mt-1">{branding.tagline}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-semibold text-dark mb-6">
            {backupCodes ? t("Save your backup codes") : mfa?.step === "setup" ? t("Set up two-step sign-in") : mfa ? t("Two-step sign-in") : t("Sign In")}
          </h2>

          {error && (
            <div className="bg-red-50 text-risk-high px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {backupCodes ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                {t("If you lose your phone, each of these codes signs you in once instead of the app. Print them or write them down and keep them somewhere safe. They will not be shown again.")}
              </p>
              <ul className="grid grid-cols-2 gap-2 font-mono text-sm bg-gray-50 rounded-lg p-4">
                {backupCodes.map((c) => <li key={c}>{c}</li>)}
              </ul>
              <button
                type="button"
                onClick={() => afterCodes?.()}
                className="w-full bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg font-medium transition-colors"
              >
                {t("I have saved them, continue")}
              </button>
            </div>
          ) : mfa ? (
            <form onSubmit={handleCode} className="space-y-4">
              {mfa.step === "setup" ? (
                <>
                  <p className="text-sm text-gray-600">
                    {t("As a Super Admin you need a code from your phone to sign in. Install an authenticator app (Google Authenticator or Microsoft Authenticator), tap Add, and scan this code.")}
                  </p>
                  {mfa.qrSvg && (
                    // Built on our own server from the otpauth link, not user content.
                    <div className="w-48 h-48 mx-auto" dangerouslySetInnerHTML={{ __html: mfa.qrSvg }} />
                  )}
                  <p className="text-xs text-gray-500 text-center">
                    {t("Cannot scan? Type this key into the app instead:")}
                    <br />
                    <span className="font-mono text-sm text-dark break-all select-all">{mfa.secret?.match(/.{1,4}/g)?.join(" ")}</span>
                  </p>
                  <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-700 mb-1">
                    {t("Then enter the 6-digit code the app shows")}
                  </label>
                </>
              ) : (
                <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-700 mb-1">
                  {t("Enter the 6-digit code from your authenticator app, or one of your backup codes")}
                </label>
              )}
              <input
                id="mfa-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode={mfa.step === "setup" ? "numeric" : "text"}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition font-mono tracking-widest text-center"
                placeholder="123456"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t("Signing in...") : t("Continue")}
              </button>
              <button
                type="button"
                onClick={() => { setMfa(null); setError(""); setPassword(""); }}
                className="w-full text-sm text-gray-500 hover:underline"
              >
                {t("Back")}
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("Email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                placeholder={t("your@email.com")}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("Password")}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition pr-10"
                  placeholder={t("Enter password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t("Signing in...") : t("Sign In")}
            </button>
          </form>
          )}

          <p className="text-center text-sm text-gray-500 mt-5">
            <Link href="/forgot-password" className="text-primary hover:underline">
              {t("Forgot your password?")}
            </Link>
          </p>
        </div>

        {branding.slogan && (
          <p className="text-center text-xs text-gray-400 mt-6">
            &quot;{branding.slogan}&quot;
            {branding.sloganSuffix ? ` — ${branding.sloganSuffix}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
