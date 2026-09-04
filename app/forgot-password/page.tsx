"use client";

import { useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Only a genuinely broken site (no mail provider, send failed) gets
        // here. An unknown address deliberately looks exactly like a hit.
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setSent(data.message);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Check your email">
        <div className="bg-green-50 text-green-800 px-4 py-3 rounded-lg mb-6 text-sm">
          {sent}
        </div>
        <p className="text-sm text-gray-600 mb-6">
          If it has not arrived in a few minutes, check your junk folder before
          asking for another link.
        </p>
        <Link
          href="/login"
          className="block w-full text-center bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg font-medium transition-colors"
        >
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?">
      <p className="text-sm text-gray-600 mb-6">
        Enter the email address you sign in with and we will send you a link to
        choose a new password.
      </p>

      {error && (
        <div className="bg-red-50 text-risk-high px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
            placeholder="your@email.com"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Sending..." : "Send reset link"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
