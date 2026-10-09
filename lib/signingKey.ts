// ---------------------------------------------------------------------------
// The HMAC key behind every token this app signs: password-reset links and
// sign-in sessions.
//
// AUTH_SECRET is the one to set, but it is deliberately OPTIONAL: a new school
// must be able to come up with nothing but a Blob store, and an auth flow that
// silently does not work until somebody remembers an extra env var is worse
// than none. Every fallback is a server-only secret the deployment already
// cannot run without, and it is only ever used as HMAC key material, so it is
// never exposed. 🔴 Never add a NEXT_PUBLIC_ value to this chain: anything
// public here lets anyone mint a session for any user.
//
// Rotating whichever value is in play signs everybody out and kills
// outstanding reset links. That is the correct behaviour, not a bug.
// ---------------------------------------------------------------------------

export function authSigningKey(): string {
  const key =
    process.env.AUTH_SECRET ||
    process.env.CRON_SECRET ||
    // TENANT_SECRET is present on every multi-tenant deployment, where
    // BLOB_READ_WRITE_TOKEN may not be set at all because each school brings
    // its own store token. Without this the fallback chain would run out on
    // exactly the deployment that serves the most schools.
    process.env.TENANT_SECRET ||
    process.env.BLOB_READ_WRITE_TOKEN;
  if (!key) {
    throw new Error("No signing key available (set AUTH_SECRET)");
  }
  return key;
}
