import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { listFiles } from "@/lib/controlData";
import {
  getPolicies,
  savePolicies,
  getPolicyVersions,
  type PolicyMeta,
} from "@/lib/policyData";

// Rebuilds policies/index.json from the per-policy blobs that survived.
//
// Why this is needed: an upload writes the file and versions.json to paths of
// its own, then appends the policy to ONE shared index. Only that last step
// could lose a write (see lib/controlData.ts), so a policy missing from the
// list still has its file and its versions.json sitting in storage — orphaned,
// not gone. This walks storage and puts the orphans back.
//
// Only ever ADDS. An entry already in the index is left exactly as it is, so
// running this twice is safe and it can never overwrite a name or a score.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_policies");
  if (session instanceof NextResponse) return session;

  try {
    const existing = await getPolicies();
    const known = new Set(existing.map((p) => p.id));

    // listFiles returns the first path segment under policies/, so this is
    // every policy folder plus index.json itself.
    const entries = await listFiles("policies");
    const candidates = [...new Set(entries)].filter(
      (name) => name !== "index.json" && !name.endsWith(".json")
    );

    const recovered: { id: string; name: string }[] = [];

    for (const policyId of candidates) {
      if (known.has(policyId)) continue;

      // versions.json is the proof a real upload happened here, and carries
      // the original filename and time. No versions means nothing to restore.
      const versions = await getPolicyVersions(policyId);
      if (versions.length === 0) continue;

      const latest = versions[versions.length - 1];
      // The name lived only in the lost index entry. The uploaded filename is
      // the best surviving evidence of what the policy was called.
      const name = (latest.filename || policyId).replace(/\.[^.]+$/, "");

      existing.push({
        id: policyId,
        name,
        description: "",
        category: "General",
        currentVersion: latest.version,
        createdBy: latest.uploadedBy,
        createdAt: latest.uploadedAt,
        updatedAt: latest.uploadedAt,
        lastCheckScore: null,
        lastCheckDate: null,
      } satisfies PolicyMeta);

      recovered.push({ id: policyId, name });
    }

    if (recovered.length > 0) await savePolicies(existing);

    return NextResponse.json({
      recovered: recovered.length,
      policies: recovered,
      total: existing.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not rebuild the policy list" },
      { status: 500 }
    );
  }
}
