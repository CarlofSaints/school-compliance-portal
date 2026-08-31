import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { listFiles } from "@/lib/controlData";
import {
  getPolicies,
  savePolicies,
  getPolicyVersions,
  getPolicyMeta,
  savePolicyMeta,
  isPolicyDeleted,
  type PolicyMeta,
} from "@/lib/policyData";

// Rebuilds policies/index.json from the per-policy blobs that survived.
//
// Why this is needed: an upload writes the file, versions.json and meta.json to
// paths of its own, then appends the policy to ONE shared index. Only that last
// step can lose a write (see lib/controlData.ts), so a policy missing from the
// list is orphaned rather than gone. This walks storage and puts the orphans
// back, with their real name and category from meta.json.
//
// Only ever ADDS. An entry already in the index keeps exactly the details it
// has, so running this twice is safe and it can never overwrite a name or a
// score. Deleted policies leave a tombstone and are not resurrected.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_policies");
  if (session instanceof NextResponse) return session;

  try {
    const existing = await getPolicies();
    const known = new Map(existing.map((p) => [p.id, p]));

    // listFiles returns the first path segment under policies/, so this is
    // every policy folder plus index.json itself.
    const entries = await listFiles("policies");
    const candidates = [...new Set(entries)].filter(
      (name) => name !== "index.json" && !name.endsWith(".json")
    );

    const recovered: { id: string; name: string; fromMeta: boolean }[] = [];
    let backfilled = 0;

    for (const policyId of candidates) {
      // Deleted on purpose. Putting it back would undo the deletion.
      if (await isPolicyDeleted(policyId)) continue;

      const meta = await getPolicyMeta(policyId);

      if (known.has(policyId)) {
        // Listed already. Give it its own copy if it predates meta.json, so a
        // future loss can be restored with the real details rather than a
        // filename.
        if (!meta) {
          await savePolicyMeta(known.get(policyId)!);
          backfilled++;
        }
        continue;
      }

      if (meta) {
        existing.push(meta);
        recovered.push({ id: policyId, name: meta.name, fromMeta: true });
        continue;
      }

      // No own copy: this policy was uploaded before meta.json existed. Fall
      // back to versions.json, which at least proves a real upload happened
      // here and carries the original filename and time.
      const versions = await getPolicyVersions(policyId);
      if (versions.length === 0) continue;

      const latest = versions[versions.length - 1];
      const name = (latest.filename || policyId).replace(/\.[^.]+$/, "");
      const restored: PolicyMeta = {
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
      };

      existing.push(restored);
      await savePolicyMeta(restored);
      recovered.push({ id: policyId, name, fromMeta: false });
    }

    if (recovered.length > 0) await savePolicies(existing);

    return NextResponse.json({
      recovered: recovered.length,
      policies: recovered,
      backfilled,
      total: existing.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not rebuild the policy list" },
      { status: 500 }
    );
  }
}
