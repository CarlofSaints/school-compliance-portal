import { put, get, list } from "@vercel/blob";
import {
  createBlobStore,
  deleteBlobStore,
  countBlobStores,
  isProvisioningConfigured,
} from "./vercelApi";
import {
  createTenant,
  TenantConflictError,
  isTenantKeyAvailable,
} from "./tenantRegistry";
import { checkTenantKey, normaliseHostname, type Tenant } from "./tenant";
import { seal } from "./secretBox";
import { normaliseHex } from "./brandingColors";
import { isPlausibleEmail } from "./emailIdentity";

// ---------------------------------------------------------------------------
// Creating a school, start to finish, with nobody watching.
//
// Carl: "i want them to be able to create their school at 1am if they want. i
// dont see why i need to be involved."
//
// So this runs unattended, which means every step has to clean up after itself.
// A half-made school is worse than no school: it holds a name nobody can use,
// and it costs a Blob store against an account limit.
// ---------------------------------------------------------------------------

/** Hard ceiling on Blob stores. Pro allows 500; stopping short leaves room to
 *  onboard a real school by hand after a bad night. Raise with MAX_SCHOOLS. */
const DEFAULT_MAX_SCHOOLS = 400;
/** How many schools one email address may create in the window below. */
const SIGNUPS_PER_EMAIL = 3;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

function maxSchools(): number {
  const n = Number(process.env.MAX_SCHOOLS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_SCHOOLS;
}

// The signup log lives in the CONTROL store, not a school's: it has to be
// readable before any school exists, and it is about the account, not a tenant.
function controlToken(): string | undefined {
  return process.env.CONTROL_BLOB_READ_WRITE_TOKEN;
}

interface SignupAttempt {
  email: string;
  at: number;
  key: string;
}

/**
 * Rate limiting, per email address.
 *
 * Deliberately NOT a gate on real schools: three in an hour is far more than
 * anyone legitimately needs, and nobody signing up for one school will ever
 * see it. It exists because the account has a hard ceiling of 500 Blob stores,
 * and a script pointed at an open signup form would burn through that ceiling
 * overnight and leave a PAYING school unable to join in the morning. The limit
 * protects the ability to onboard, not the signup form.
 *
 * One document per email address rather than a shared log, so two signups at
 * once cannot erase each other's history.
 */
async function recentSignups(email: string): Promise<SignupAttempt[]> {
  const token = controlToken();
  if (!token) return [];
  const key = `signups/${encodeURIComponent(email.toLowerCase())}.json`;
  try {
    const r = await get(key, { access: "private", useCache: false, token });
    if (!r) return [];
    const all = JSON.parse(await new Response(r.stream).text()) as SignupAttempt[];
    const since = Date.now() - SIGNUP_WINDOW_MS;
    return all.filter((a) => a.at >= since);
  } catch {
    return [];
  }
}

async function recordSignup(email: string, key: string): Promise<void> {
  const token = controlToken();
  if (!token) return;
  const path = `signups/${encodeURIComponent(email.toLowerCase())}.json`;
  const kept = [...(await recentSignups(email)), { email, at: Date.now(), key }];
  await put(path, JSON.stringify(kept), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  }).catch(() => {
    // A failure to record must not fail the signup. The worst case is somebody
    // gets one extra attempt.
  });
}

export interface NewSchoolRequest {
  /** Display name, as the school writes it. */
  name: string;
  /** Subdomain and data prefix. */
  key: string;
  /** The person creating it. Becomes the first admin. */
  adminEmail: string;
  adminName?: string;
  /** Optional branding chosen during signup. */
  primary?: string;
  accent?: string;
  /** The hostname it will answer on. Derived from the key by the caller. */
  hostname: string;
}

export type ProvisionFailure =
  | { ok: false; reason: "not_configured"; message: string }
  | { ok: false; reason: "invalid"; message: string }
  | { ok: false; reason: "taken"; message: string }
  | { ok: false; reason: "rate_limited"; message: string }
  | { ok: false; reason: "at_capacity"; message: string }
  | { ok: false; reason: "failed"; message: string };

export type ProvisionResult =
  | { ok: true; tenant: Tenant }
  | ProvisionFailure;

/** Everything that can be judged without creating anything. Split out so the
 *  signup form can check as somebody types, using the same rules the real
 *  create uses rather than a second copy that drifts. */
export async function validateNewSchool(
  req: Pick<NewSchoolRequest, "name" | "key" | "adminEmail">
): Promise<ProvisionFailure | null> {
  if (!isProvisioningConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      message: "New schools cannot be created on this deployment.",
    };
  }
  if (!req.name?.trim()) {
    return { ok: false, reason: "invalid", message: "The school needs a name." };
  }
  if (!isPlausibleEmail(req.adminEmail || "")) {
    return {
      ok: false,
      reason: "invalid",
      message: "That does not look like an email address.",
    };
  }
  const problem = checkTenantKey(req.key || "");
  if (problem === "invalid") {
    return {
      ok: false,
      reason: "invalid",
      message:
        "The address can use 3 to 32 lowercase letters, numbers and hyphens, and cannot start or end with a hyphen.",
    };
  }
  if (problem === "reserved") {
    return {
      ok: false,
      reason: "taken",
      message: "That address is not available. Please choose another.",
    };
  }
  if (!(await isTenantKeyAvailable(req.key))) {
    // Same wording as "reserved" on purpose. Which addresses are taken is not
    // anybody's business, and a different message turns this into a way to
    // enumerate every school on the platform.
    return {
      ok: false,
      reason: "taken",
      message: "That address is not available. Please choose another.",
    };
  }
  return null;
}

/**
 * Creates a school: its own Blob store, its registry entry, its branding.
 *
 * Order matters and is chosen so that a failure at any step leaves nothing
 * behind. The NAME is claimed before the store is made, because a name is what
 * two people can collide on; the store is deleted again if the claim then
 * fails for any other reason.
 */
export async function provisionSchool(
  req: NewSchoolRequest
): Promise<ProvisionResult> {
  const invalid = await validateNewSchool(req);
  if (invalid) return invalid;

  const email = req.adminEmail.trim().toLowerCase();
  const attempts = await recentSignups(email);
  if (attempts.length >= SIGNUPS_PER_EMAIL) {
    return {
      ok: false,
      reason: "rate_limited",
      message:
        "That is several schools from one address in a short time. Please get in touch and we will set the rest up with you.",
    };
  }

  const used = await countBlobStores();
  if (used !== null && used >= maxSchools()) {
    // Deliberately not "we are full": the person signing up cannot act on that,
    // and it is a problem for Carl to fix, not them.
    console.error(`[provisioning] AT CAPACITY: ${used} stores, limit ${maxSchools()}`);
    return {
      ok: false,
      reason: "at_capacity",
      message:
        "We cannot create new schools right this moment. Please try again shortly, or get in touch.",
    };
  }

  const hostname = normaliseHostname(req.hostname);
  let storeId: string | undefined;

  try {
    const store = await createBlobStore(`school-${req.key}`);
    storeId = store.storeId;

    const tenant: Tenant = {
      key: req.key,
      name: req.name.trim(),
      hostnames: [hostname],
      blobStoreId: store.storeId,
      // Sealed before it is written anywhere. The control store holds the
      // credentials to every school's data, so a plain token in it would make
      // one leak into all of them.
      blobTokenSealed: seal(store.token),
      status: "active",
      createdAt: new Date().toISOString(),
      branding: { fullName: req.name.trim() },
    };

    // Colours chosen during signup are written into the school's OWN store
    // once it exists, not onto the tenant record. Branding belongs with the
    // school's data, and lib/brandingData.ts already reads it from there for
    // every page and every email.
    const chosen = {
      primary: normaliseHex(req.primary || "") || undefined,
      accent: normaliseHex(req.accent || "") || undefined,
    };

    // The atomic claim. Throws TenantConflictError if somebody took the name in
    // the seconds since it was checked, which is exactly the race an open
    // signup form invites.
    await createTenant(tenant);

    // Seed the school's own store. Written with ITS token, so this is the first
    // thing that ever touches the new store, and it proves the token works
    // before anybody is told the school is ready.
    if (chosen.primary || chosen.accent) {
      await put(
        `${req.key}/branding.json`,
        JSON.stringify({ fullName: req.name.trim(), ...chosen }, null, 2),
        {
          access: "private",
          contentType: "application/json",
          addRandomSuffix: false,
          allowOverwrite: true,
          token: store.token,
        }
      );
    }

    await recordSignup(email, req.key);
    return { ok: true, tenant };
  } catch (err) {
    // The store is ours and nothing references it, so remove it. Left behind it
    // is invisible, unusable, and one closer to the ceiling.
    if (storeId) await deleteBlobStore(storeId).catch(() => {});

    if (err instanceof TenantConflictError) {
      return {
        ok: false,
        reason: "taken",
        message: "That address is not available. Please choose another.",
      };
    }
    console.error("[provisioning] Failed:", err);
    return {
      ok: false,
      reason: "failed",
      message:
        "Something went wrong setting up the school. Nothing was created, so please try again.",
    };
  }
}

/** Removes the store from a provisioning that failed part way, and nothing
 *  else. A real school is suspended via its status and never deleted: its data
 *  is the school's, not ours. */
export async function destroyPartialSchool(storeId: string): Promise<void> {
  await deleteBlobStore(storeId).catch(() => {});
}
