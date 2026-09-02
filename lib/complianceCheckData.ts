import { createHash } from "crypto";
import {
  readJson,
  writeJson,
  writeFile,
  readFile,
  listFiles,
  deleteFile,
} from "./controlData";

export type RiskStatus =
  | "not_an_issue"
  | "needs_addressing"
  | "in_progress"
  | "addressed";

export const RISK_STATUSES: RiskStatus[] = [
  "not_an_issue",
  "needs_addressing",
  "in_progress",
  "addressed",
];

export interface StatusCounts {
  not_an_issue: number;
  needs_addressing: number;
  in_progress: number;
  addressed: number;
  unreviewed: number;
}

export interface ComplianceCheckRisk {
  severity: "low" | "medium" | "high";
  section: string;
  description: string;
  guideline_reference: string;
  suggestion: string;
  status?: RiskStatus; // workflow status set by reviewers; undefined = unreviewed
}

export function countStatuses(risks: ComplianceCheckRisk[]): StatusCounts {
  const counts: StatusCounts = {
    not_an_issue: 0,
    needs_addressing: 0,
    in_progress: 0,
    addressed: 0,
    unreviewed: 0,
  };
  for (const r of risks) {
    if (r.status) counts[r.status]++;
    else counts.unreviewed++;
  }
  return counts;
}

// Every compliance check in the portal is one of these, whether it was run
// against a policy in the register or against a document somebody dropped on
// the Compliance Check page.
//
// It used to be two separate things. A check started from a policy was written
// to policies/<id>/checks/, a check started from an upload was written here,
// and neither could see the other: the dashboard counted only uploads, the
// Policies page showed only policy checks, and the same screen wrote to a
// different store depending on which tab you were on. policyId is what closes
// that gap. It is optional because a document genuinely may not be in the
// register yet, not because the link is optional in principle.
export interface ComplianceCheckRecord {
  id: string;
  name: string; // document name given by the user, or the policy's name
  filename: string; // original uploaded filename (for download)
  ext: string;
  hash?: string; // sha256 of the uploaded file bytes (for duplicate detection)
  policyId?: string; // set when the check is against a policy in the register
  policyVersion?: number; // which version of that policy was checked
  score: number;
  summary: string;
  risks: ComplianceCheckRisk[];
  sources?: { title: string; url: string }[];
  issueCount: number;
  checkedBy: string; // user id
  checkedByName: string;
  checkedAt: string;
}

const CHECKS_INDEX = "compliance/checks.json";
const MIGRATION_MARKER = "compliance/legacy-checks-folded-in.json";

// Each check also keeps its own copy, written before the shared index is
// appended to. compliance/checks.json is read-append-write by every check that
// runs, so an overlapping pair can lose one of them; this path is used by one
// check only and cannot be. Same reasoning as policies/<id>/meta.json.
function checkPath(id: string): string {
  return `compliance/checks/${id}.json`;
}

// A direct pointer from (file content + the name it was checked under) to the
// check's id.
//
// Duplicate detection used to scan the shared index, and the index is the one
// thing in this store that is NOT safe to read straight after a write: it can
// come back stale long enough to miss a record that already exists. That
// defeated the check exactly when it matters most, two runs of the same
// document seconds apart. HVPS has a pair 17 seconds apart, identical bytes and
// identical name, that both ran and scored 72 and 68.
//
// One tiny blob per (content, name), written before the index like every own
// copy here, and read by direct key. No scan and nothing to go stale.
function hashPointerPath(hash: string, name: string): string {
  const key = createHash("sha256")
    .update(`${hash}\u0000${name}`)
    .digest("hex");
  return `compliance/by-hash/${key}.json`;
}

async function readIndex(): Promise<ComplianceCheckRecord[]> {
  return readJson<ComplianceCheckRecord[]>(CHECKS_INDEX, []);
}

function newestFirst(checks: ComplianceCheckRecord[]): ComplianceCheckRecord[] {
  return [...checks].sort(
    (a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
  );
}

export async function getComplianceChecks(): Promise<ComplianceCheckRecord[]> {
  await foldInLegacyPolicyChecks();
  return newestFirst(await readIndex());
}

export async function getComplianceChecksForPolicy(
  policyId: string
): Promise<ComplianceCheckRecord[]> {
  const checks = await getComplianceChecks();
  return checks.filter((c) => c.policyId === policyId);
}

export async function getComplianceCheckById(
  id: string
): Promise<ComplianceCheckRecord | undefined> {
  // The check's own copy first, for the same reason getPolicyById reads the
  // policy's: it is readable the moment the check finishes, whereas the shared
  // index takes a moment to propagate.
  const own = await readJson<ComplianceCheckRecord | null>(checkPath(id), null);
  if (own) return own;

  const checks = await readIndex();
  return checks.find((c) => c.id === id);
}

// Duplicate detection by file content (sha256) AND the name it was checked
// under. An edited file produces a different hash and is treated as a new check.
//
// The name is part of the key because it is part of the QUESTION: the engine
// puts "DOCUMENT NAME: <name>" in the prompt and the model reasons about it —
// one admissions policy submitted as "2026 LANGUAGE POLICY.pdf" was marked down
// to 52 for being "fundamentally mislabeled". Keying on bytes alone made that
// unrecoverable: correcting the name and running it again returned the saved
// result under the WRONG name and never re-asked. Same bytes under a different
// name is a genuinely different question, so it runs again.
export async function findComplianceCheckByHash(
  hash: string,
  name: string
): Promise<ComplianceCheckRecord | undefined> {
  const pointer = await readJson<{ id: string } | null>(
    hashPointerPath(hash, name),
    null
  );
  if (pointer?.id) {
    const record = await getComplianceCheckById(pointer.id);
    if (record) return record;
  }

  // Older checks pre-date the pointer, so the index still has to be consulted.
  const checks = await readIndex();
  return checks.find((c) => c.hash === hash && c.name === name);
}

// Saves a check. fileData is the document's bytes, stored alongside the record
// so it can be downloaded later. A check against a policy passes null: that
// file is already in the register under the policy, and copying it would put
// the same document in storage twice and let the two drift.
export async function addComplianceCheck(
  record: ComplianceCheckRecord,
  fileData: Buffer | null
): Promise<void> {
  if (fileData) {
    await writeFile(`compliance/${record.id}/${record.filename}`, fileData);
  }
  // Own copy first, so a lost index append is recoverable rather than fatal.
  await writeJson(checkPath(record.id), record);
  // Then the pointer, so a repeat of this document is recognised even while the
  // shared index is still catching up.
  if (record.hash) {
    await writeJson(hashPointerPath(record.hash, record.name), { id: record.id });
  }
  const checks = await readIndex();
  checks.push(record);
  await writeJson(CHECKS_INDEX, checks);
}

export async function deleteComplianceCheck(id: string): Promise<boolean> {
  // Read the record before it goes, so its pointer can go with it. A pointer
  // left behind would hand back a check that no longer exists.
  const existing = await getComplianceCheckById(id);
  if (existing?.hash) {
    await deleteFile(hashPointerPath(existing.hash, existing.name));
  }

  const checks = await readIndex();
  const remaining = checks.filter((c) => c.id !== id);
  const wasIndexed = remaining.length !== checks.length;

  // The own copy has to go even when the index never had the record, or a
  // check deleted before its index append landed would come back on the next
  // read by id.
  await deleteFile(checkPath(id));
  if (wasIndexed) await writeJson(CHECKS_INDEX, remaining);
  return wasIndexed;
}

export async function downloadComplianceCheckFile(
  id: string,
  filename: string
): Promise<Buffer | null> {
  return readFile(`compliance/${id}/${filename}`);
}

// Sets (or clears, when status is null) the workflow status of one risk.
export async function updateRiskStatus(
  checkId: string,
  riskIndex: number,
  status: RiskStatus | null
): Promise<ComplianceCheckRecord | null> {
  const current = await getComplianceCheckById(checkId);
  if (!current || riskIndex < 0 || riskIndex >= current.risks.length) {
    return null;
  }

  const risks = current.risks.map((r, i) => {
    if (i !== riskIndex) return r;
    const next = { ...r };
    if (status === null) delete next.status;
    else next.status = status;
    return next;
  });
  const updated = { ...current, risks };

  // Both copies, always. The dashboard totals its status pills from the index
  // while the check page reads the own copy, so updating one and not the other
  // is how the two views start disagreeing again.
  await writeJson(checkPath(checkId), updated);
  const checks = await readIndex();
  const idx = checks.findIndex((c) => c.id === checkId);
  if (idx !== -1) {
    checks[idx] = updated;
    await writeJson(CHECKS_INDEX, checks);
  }
  return updated;
}

// Attaches an existing check to a policy. Used when a document that was
// checked on its own is added to the register afterwards: the check it already
// has should follow it in rather than being re-run at cost.
export async function attachCheckToPolicy(
  checkId: string,
  policyId: string,
  policyVersion: number,
  name: string
): Promise<ComplianceCheckRecord | null> {
  const current = await getComplianceCheckById(checkId);
  if (!current) return null;

  const updated = { ...current, policyId, policyVersion, name };
  await writeJson(checkPath(checkId), updated);
  const checks = await readIndex();
  const idx = checks.findIndex((c) => c.id === checkId);
  if (idx !== -1) {
    checks[idx] = updated;
    await writeJson(CHECKS_INDEX, checks);
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Folding in the checks written under the old two-store arrangement.
//
// Policy checks used to live at policies/<id>/checks/<checkId>.json, one file
// per check and no index. Those are real results the school paid to run, so
// they are moved into the unified index rather than abandoned.
//
// This runs once. Scanning every policy's checks folder costs one blob listing
// per policy, far too much to repeat on every dashboard load, so a marker
// records that it has been done: reading the marker is one small read, and the
// scan behind it happens on the first read after deploy and never again. It
// only ever ADDS, and skips any id the index already holds, so a second run
// (two people opening the dashboard at the same moment) is harmless.
// ---------------------------------------------------------------------------

interface LegacyPolicyCheck {
  id: string;
  policyId: string;
  score: number;
  summary: string;
  risks: ComplianceCheckRisk[];
  checkedBy: string;
  checkedAt: string;
}

async function foldInLegacyPolicyChecks(): Promise<void> {
  const done = await readJson<{ at: string } | null>(MIGRATION_MARKER, null);
  if (done) return;

  // Imported lazily: policyData has no need of this module, and keeping the
  // dependency out of the module body avoids a cycle if it ever does.
  const { getPolicies, getPolicyVersions } = await import("./policyData");

  try {
    const policies = await getPolicies();
    const index = await readIndex();
    const known = new Set(index.map((c) => c.id));
    const folded: ComplianceCheckRecord[] = [];

    for (const policy of policies) {
      const files = await listFiles(`policies/${policy.id}/checks`);
      if (files.length === 0) continue;

      let versions: Awaited<ReturnType<typeof getPolicyVersions>> | null = null;
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const legacy = await readJson<LegacyPolicyCheck | null>(
          `policies/${policy.id}/checks/${file}`,
          null
        );
        if (!legacy || !legacy.id || known.has(legacy.id)) continue;

        if (!versions) versions = await getPolicyVersions(policy.id);
        const version = versions[versions.length - 1];

        folded.push({
          id: legacy.id,
          name: policy.name,
          filename: version?.filename || `${policy.name}.pdf`,
          ext: version?.ext || "pdf",
          policyId: policy.id,
          policyVersion: version?.version,
          score: legacy.score,
          summary: legacy.summary,
          risks: legacy.risks || [],
          issueCount: (legacy.risks || []).length,
          checkedBy: legacy.checkedBy,
          // The old record kept only a user id and there is no name to
          // recover from it. Left blank rather than guessed at.
          checkedByName: "",
          checkedAt: legacy.checkedAt,
        });
        known.add(legacy.id);
      }
    }

    if (folded.length > 0) {
      for (const record of folded) {
        await writeJson(checkPath(record.id), record);
      }
      await writeJson(CHECKS_INDEX, [...index, ...folded]);
    }
    await writeJson(MIGRATION_MARKER, { at: new Date().toISOString() });
  } catch (err) {
    // A failed fold-in must not take the dashboard down with it. No marker is
    // written, so the next read tries again.
    console.error("Could not fold in legacy policy checks:", err);
  }
}
