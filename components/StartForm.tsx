"use client";

import { useState, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Setting a school up, with nobody on our side involved.
//
// Reachable on ANY hostname, including one no school owns yet, because
// somebody who types their school's address before it exists should be offered
// the thing that creates it rather than a dead end. See PUBLIC_ON_ANY_HOST in
// lib/tenantContext.
//
// No login, by design. There is no account to have first: this is what makes
// the account.
// ---------------------------------------------------------------------------

/** "Hurlyvale Primary School" -> "hurlyvale-primary-school". */
function suggestKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents rather than drop the letter
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, ""); // a trailing hyphen after the cut is invalid
}

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "free"; hostname: string }
  | { state: "taken"; reason: string };

export default function StartForm() {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  // Once somebody edits the address themselves, the name must stop overwriting
  // it. Retyping a school name should not silently undo their choice.
  const [keyTouched, setKeyTouched] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const [avail, setAvail] = useState<Availability>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ url: string; email: string } | null>(null);

  const effectiveKey = keyTouched ? key : suggestKey(name);

  // Availability, debounced. The same rules the real create uses, so the form
  // cannot say "available" about something the server will refuse.
  const seq = useRef(0);
  useEffect(() => {
    if (effectiveKey.length < 3) {
      setAvail({ state: "idle" });
      return;
    }
    setAvail({ state: "checking" });
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/schools?key=${encodeURIComponent(effectiveKey)}`);
        const data = await res.json();
        // A slower earlier request must not overwrite a newer answer.
        if (mine !== seq.current) return;
        setAvail(
          data.available
            ? { state: "free", hostname: data.hostname }
            : { state: "taken", reason: data.reason || "That address is not available." }
        );
      } catch {
        if (mine === seq.current) setAvail({ state: "idle" });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [effectiveKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Give the school its name.");
    if (!adminEmail.trim()) return setError("We need an email address for the first administrator.");
    if (avail.state === "taken") return setError(avail.reason);

    setBusy(true);
    try {
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          key: effectiveKey,
          adminName: adminName.trim(),
          adminEmail: adminEmail.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "That school could not be set up.");
        return;
      }
      setDone({ url: data.url, email: adminEmail.trim() });
    } catch {
      setError("That school could not be set up. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <h1 className="text-2xl font-bold text-dark">Your school is ready.</h1>
        <p className="mt-3 text-gray-600">
          It lives at{" "}
          <a href={done.url} className="text-primary font-medium hover:underline">
            {done.url.replace(/^https:\/\//, "")}
          </a>
          .
        </p>
        {/* 🔴 The link to set a password went to their inbox and is NOT shown
            here. Anyone standing behind this screen would otherwise be one
            click from owning the school's first administrator account. */}
        <p className="mt-4 text-gray-600">
          We have emailed <strong>{done.email}</strong> a link to set a password.
          It is good for a few hours. Once you are in, add the rest of your
          governing body under Admin, Users.
        </p>
        <p className="mt-4 text-sm text-gray-500">
          Nothing arrived? Check the junk folder first. If it is not there, the
          school still exists, so get in touch rather than setting it up again.
        </p>
        <a
          href={done.url}
          className="mt-8 inline-block rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
        >
          Go to your portal
        </a>
      </main>
    );
  }

  const label = "block text-sm font-medium text-gray-700 mb-1";
  const field =
    "w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition";

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-bold text-dark">Set your school up</h1>
      <p className="mt-2 text-gray-600">
        This takes about a minute. You will have your own portal, on your own
        address, with your school&apos;s data kept separate from every other
        school.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <div>
          <label className={label} htmlFor="name">
            The school&apos;s name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hurlyvale Primary School"
            className={field}
            autoComplete="organization"
          />
        </div>

        <div>
          <label className={label} htmlFor="key">
            Your address
          </label>
          <input
            id="key"
            value={effectiveKey}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value.toLowerCase());
            }}
            placeholder="hurlyvale-primary"
            className={field}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-1 text-xs min-h-[1.25rem]">
            {avail.state === "checking" && (
              <span className="text-gray-400">Checking...</span>
            )}
            {avail.state === "free" && (
              <span className="text-emerald-700">
                {avail.hostname} is available.
              </span>
            )}
            {avail.state === "taken" && (
              <span className="text-risk-high">{avail.reason}</span>
            )}
            {avail.state === "idle" && (
              <span className="text-gray-400">
                Lowercase letters, numbers and hyphens. This becomes your web
                address and cannot be changed later.
              </span>
            )}
          </p>
        </div>

        <div className="pt-2 border-t border-gray-100" />

        <div>
          <label className={label} htmlFor="adminName">
            Your name
          </label>
          <input
            id="adminName"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            placeholder="Carl Dos Santos"
            className={field}
            autoComplete="name"
          />
        </div>

        <div>
          <label className={label} htmlFor="adminEmail">
            Your email address
          </label>
          <input
            id="adminEmail"
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="you@yourschool.co.za"
            className={field}
            autoComplete="email"
          />
          <p className="mt-1 text-xs text-gray-400">
            You become the first administrator. We send a link here to set your
            password, so use an address you can open now.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-risk-high">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || avail.state === "taken"}
          className="w-full bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
        >
          {busy ? "Setting your school up..." : "Create my school"}
        </button>
      </form>
    </main>
  );
}
