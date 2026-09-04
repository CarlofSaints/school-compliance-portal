// ---------------------------------------------------------------------------
// The bit of Vercel's REST API needed to give a new school its OWN Blob store.
//
// 🔴 A Vercel access token is ACCOUNT-WIDE. Vercel has no way to scope one to
// "blob stores only", so the token this module needs can also read every
// project, every env var and every deployment on the account. Treat
// VERCEL_API_TOKEN as the most dangerous secret in the deployment: it is the
// one that would turn a compromise of this app into a compromise of everything
// else running on the same Vercel account.
//
// Nothing here is called on a normal request. It runs once, when a school is
// created.
// ---------------------------------------------------------------------------

const API = "https://api.vercel.com";

function config() {
  const token = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  // The project a new store is briefly attached to, only so Vercel will mint a
  // token for it. See createBlobStore for why that dance is necessary.
  const projectId = process.env.VERCEL_PROVISIONING_PROJECT_ID;
  if (!token || !teamId || !projectId) {
    throw new Error(
      "Provisioning is not configured (needs VERCEL_API_TOKEN, VERCEL_TEAM_ID and VERCEL_PROVISIONING_PROJECT_ID)."
    );
  }
  return { token, teamId, projectId };
}

/** Whether this deployment can create schools at all. Lets a deployment that
 *  is not the provisioner say so cleanly instead of throwing mid-signup. */
export function isProvisioningConfigured(): boolean {
  return !!(
    process.env.VERCEL_API_TOKEN &&
    process.env.VERCEL_TEAM_ID &&
    process.env.VERCEL_PROVISIONING_PROJECT_ID
  );
}

async function call<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: T | null }> {
  const { token, teamId } = config();
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}teamId=${teamId}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    // A 204 and friends have no body, which is fine.
  }
  return { status: res.status, body };
}

export interface CreatedStore {
  storeId: string;
  /** The read/write token. Seal it before it is stored anywhere. */
  token: string;
}

/**
 * Creates a Blob store and returns a working read/write token for it.
 *
 * The four steps are not arbitrary. Vercel has NO endpoint that mints a token
 * for a store: `POST /v1/storage/stores/blob` returns the store with no
 * credential, and `/token` and `/tokens` do not exist. The only way a token is
 * ever produced is as a side effect of CONNECTING a store to a project, which
 * writes it into that project's environment variables.
 *
 * So: create, connect, read the variable, delete the variable. The token keeps
 * working after the variable is gone — verified against the live API before
 * this was written, because the whole design depends on it and a guess would
 * have been discovered at the worst possible moment.
 */
export async function createBlobStore(name: string): Promise<CreatedStore> {
  const { projectId } = config();

  const created = await call<{ store?: { id?: string } }>(
    "/v1/storage/stores/blob",
    {
      method: "POST",
      body: JSON.stringify({ name, region: "iad1", access: "private" }),
    }
  );
  const storeId = created.body?.store?.id;
  if (!storeId) {
    throw new Error(`Could not create a store (HTTP ${created.status}).`);
  }

  let envVarId: string | undefined;
  try {
    const conn = await call(`/v1/storage/stores/${storeId}/connections`, {
      method: "POST",
      body: JSON.stringify({
        projectId,
        // Production only. A wider set would create several variables and there
        // is nothing to gain from reading the same token twice.
        envVarEnvironments: ["production"],
      }),
    });
    if (conn.status >= 300) {
      throw new Error(`Could not attach the store (HTTP ${conn.status}).`);
    }

    const listed = await call<{ envs?: { id: string; key: string }[] }>(
      `/v10/projects/${projectId}/env`
    );
    // The variable is BLOB_READ_WRITE_TOKEN for the first store attached and
    // gains a prefix for later ones, so match on the suffix rather than the
    // whole name, and take the newest.
    const rows = (listed.body?.envs || []).filter((e) =>
      e.key.endsWith("BLOB_READ_WRITE_TOKEN")
    );
    const row = rows[rows.length - 1];
    if (!row) throw new Error("Vercel did not produce a token for the store.");
    envVarId = row.id;

    // Listing gives the ENCRYPTED value; fetching one by id gives the real one.
    // Reading the list and using that value produces a token-shaped string of
    // the wrong length that fails with "Access denied", which is a confusing
    // way to find this out.
    const single = await call<{ value?: string }>(
      `/v1/projects/${projectId}/env/${row.id}`
    );
    const token = single.body?.value;
    if (!token || !token.startsWith("vercel_blob_rw_")) {
      throw new Error("Could not read the store's token.");
    }
    return { storeId, token };
  } catch (err) {
    // Leave nothing half-made: a store nobody has the token for is unusable and
    // still counts against the account's store limit.
    await deleteBlobStore(storeId).catch(() => {});
    throw err;
  } finally {
    // The variable must go whether this succeeded or not. Left behind, the next
    // school's provisioning would read a stale one, and the provisioning
    // project would accumulate one variable per school.
    if (envVarId) {
      await call(`/v9/projects/${config().projectId}/env/${envVarId}`, {
        method: "DELETE",
      }).catch(() => {});
    }
  }
}

export async function deleteBlobStore(storeId: string): Promise<boolean> {
  const res = await call(`/v1/storage/stores/blob/${storeId}`, {
    method: "DELETE",
  });
  return res.status < 300;
}

/** How many Blob stores the account already has. Used to refuse a signup before
 *  it eats the last slot, rather than discovering the ceiling on the day a
 *  paying school tries to join. */
export async function countBlobStores(): Promise<number | null> {
  const res = await call<{ stores?: unknown[] }>("/v1/storage/stores?type=blob");
  if (res.status >= 300 || !res.body?.stores) return null;
  return res.body.stores.length;
}
