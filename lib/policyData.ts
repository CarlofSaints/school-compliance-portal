import { readJson, writeJson, writeFile, readFile, deleteFile, updateJson, NO_CHANGE, addToList, updateInList, removeFromList } from "./controlData";

export interface PolicyMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  currentVersion: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastCheckScore: number | null;
  lastCheckDate: string | null;
}

export interface PolicyVersion {
  version: number;
  filename: string;
  ext: string;
  uploadedBy: string;
  uploadedAt: string;
  size: number;
}

const POLICIES_INDEX = "policies/index.json";

export async function getPolicies(): Promise<PolicyMeta[]> {
  return readJson<PolicyMeta[]>(POLICIES_INDEX, []);
}

export async function savePolicies(policies: PolicyMeta[]): Promise<void> {
  return writeJson(POLICIES_INDEX, policies);
}

export async function getPolicyById(
  id: string
): Promise<PolicyMeta | undefined> {
  // The policy's own copy first. It is written to a path only this policy uses,
  // so it is readable the moment the upload finishes, whereas the shared index
  // takes a moment to propagate. Reading the index here meant a policy you had
  // just uploaded answered "not found", and the detail page sat on "Loading..."
  // until it caught up.
  const meta = await getPolicyMeta(id);
  if (meta) return meta;

  const policies = await getPolicies();
  return policies.find((p) => p.id === id);
}

// Each policy also keeps its own copy of its details, next to its file.
//
// policies/index.json is a shared document that every upload reads, appends to
// and writes back, so a write can be lost to one that overlaps it. This copy is
// written to a path only this policy uses, so it cannot be. That makes the
// index recoverable rather than authoritative: if an entry is lost, repair
// rebuilds it from here with the real name, description and category, instead
// of guessing from the filename.
function metaPath(policyId: string): string {
  return `policies/${policyId}/meta.json`;
}

export async function savePolicyMeta(policy: PolicyMeta): Promise<void> {
  return writeJson(metaPath(policy.id), policy);
}

export async function getPolicyMeta(
  policyId: string
): Promise<PolicyMeta | null> {
  return readJson<PolicyMeta | null>(metaPath(policyId), null);
}

export async function createPolicy(policy: PolicyMeta): Promise<void> {
  // Own copy first. If appending to the shared index is the step that gets
  // lost, everything needed to put it back is already safely stored.
  await savePolicyMeta(policy);
  // Guarded (lib/controlData.ts): nine policies uploaded one after another
  // once landed as four; each now waits its turn instead of overwriting.
  await addToList(POLICIES_INDEX, policy);
}

export async function updatePolicy(
  id: string,
  updates: Partial<Omit<PolicyMeta, "id">> | ((current: PolicyMeta) => Partial<Omit<PolicyMeta, "id">>)
): Promise<PolicyMeta | null> {
  const saved = await updateInList<PolicyMeta>(POLICIES_INDEX, id, (p) => ({
    ...p,
    ...(typeof updates === "function" ? updates(p) : updates),
    updatedAt: new Date().toISOString(),
  }));
  if (!saved) return null;
  // Keep the own copy in step, or a repair would restore the name this policy
  // had before it was last renamed.
  await savePolicyMeta(saved);
  return saved;
}

// A deleted policy leaves a tombstone. Its file and versions.json stay in
// storage, so without one a repair would cheerfully put it back.
function tombstonePath(policyId: string): string {
  return `policies/${policyId}/deleted.json`;
}

export async function isPolicyDeleted(policyId: string): Promise<boolean> {
  const stone = await readJson<{ deletedAt: string } | null>(
    tombstonePath(policyId),
    null
  );
  return stone !== null;
}

export async function deletePolicy(id: string): Promise<boolean> {
  if (!(await removeFromList<PolicyMeta>(POLICIES_INDEX, id))) return false;
  await writeJson(tombstonePath(id), { deletedAt: new Date().toISOString() });
  await deleteFile(metaPath(id));
  return true;
}

// Version management

/**
 * Reserves the next version number and records it, in ONE guarded write.
 *
 * 🔴 Two people uploading a new version at once both read "next is 4", both
 * wrote version 4's file (one overwriting the other) and the second list save
 * erased the first entry. Now the number is taken under the guard, so each
 * upload gets its own. The caller uploads the file under the number returned.
 */
export async function reservePolicyVersion(
  policyId: string,
  currentVersion: number,
  entry: Omit<PolicyVersion, "version">
): Promise<number> {
  let version = 0;
  await updateJson<PolicyVersion[]>(`policies/${policyId}/versions.json`, [], (versions) => {
    version = Math.max(currentVersion || 0, versions.length, ...versions.map((v) => v.version || 0)) + 1;
    return [...versions, { ...entry, version }];
  });
  return version;
}

/** Takes a reserved version back off the list, when its file failed to upload. */
export async function releasePolicyVersion(policyId: string, version: number): Promise<void> {
  await updateJson<PolicyVersion[]>(`policies/${policyId}/versions.json`, [], (versions) =>
    versions.some((v) => v.version === version) ? versions.filter((v) => v.version !== version) : NO_CHANGE
  );
}
export async function getPolicyVersions(
  policyId: string
): Promise<PolicyVersion[]> {
  return readJson<PolicyVersion[]>(
    `policies/${policyId}/versions.json`,
    []
  );
}

export async function savePolicyVersions(
  policyId: string,
  versions: PolicyVersion[]
): Promise<void> {
  return writeJson(`policies/${policyId}/versions.json`, versions);
}

export async function uploadPolicyFile(
  policyId: string,
  version: number,
  ext: string,
  data: Buffer
): Promise<void> {
  await writeFile(`policies/${policyId}/v${version}.${ext}`, data);
}

export async function downloadPolicyFile(
  policyId: string,
  version: number,
  ext: string
): Promise<Buffer | null> {
  return readFile(`policies/${policyId}/v${version}.${ext}`);
}

