import { readJson, writeJson, writeFile, readFile, listFiles, deleteFile } from "./controlData";

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

export interface ComplianceCheck {
  id: string;
  policyId: string;
  score: number;
  summary: string;
  risks: ComplianceRisk[];
  checkedBy: string;
  checkedAt: string;
}

export interface ComplianceRisk {
  severity: "low" | "medium" | "high";
  section: string;
  description: string;
  guideline_reference: string;
  suggestion: string;
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
  const policies = await getPolicies();
  policies.push(policy);
  await savePolicies(policies);
}

export async function updatePolicy(
  id: string,
  updates: Partial<Omit<PolicyMeta, "id">>
): Promise<PolicyMeta | null> {
  const policies = await getPolicies();
  const idx = policies.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  policies[idx] = { ...policies[idx], ...updates, updatedAt: new Date().toISOString() };
  await savePolicies(policies);
  // Keep the own copy in step, or a repair would restore the name this policy
  // had before it was last renamed.
  await savePolicyMeta(policies[idx]);
  return policies[idx];
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
  const policies = await getPolicies();
  const filtered = policies.filter((p) => p.id !== id);
  if (filtered.length === policies.length) return false;
  await savePolicies(filtered);
  await writeJson(tombstonePath(id), { deletedAt: new Date().toISOString() });
  await deleteFile(metaPath(id));
  return true;
}

// Version management
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

// Compliance checks
export async function getComplianceChecks(
  policyId: string
): Promise<ComplianceCheck[]> {
  const files = await listFiles(`policies/${policyId}/checks`);
  const checks: ComplianceCheck[] = [];
  for (const file of files) {
    if (file.endsWith(".json")) {
      const check = await readJson<ComplianceCheck>(
        `policies/${policyId}/checks/${file}`,
        null as unknown as ComplianceCheck
      );
      if (check) checks.push(check);
    }
  }
  return checks.sort(
    (a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
  );
}

export async function saveComplianceCheck(
  policyId: string,
  check: ComplianceCheck
): Promise<void> {
  return writeJson(`policies/${policyId}/checks/${check.id}.json`, check);
}
