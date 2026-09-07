import { NextRequest, NextResponse } from "next/server";
import { list, del } from "@vercel/blob";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { getTenantByKey, deleteTenant } from "@/lib/tenantRegistry";
import { deleteBlobStore } from "@/lib/vercelApi";
import { open } from "@/lib/secretBox";

// ---------------------------------------------------------------------------
// Removing a school, permanently.
//
// 🔴 The single most destructive thing in the product. It exists because the
// alternative is worse: without it a test school, a school created by mistake,
// or one left half-made by a failed provisioning sits there forever holding a
// name, costing a Blob store against the account ceiling, and cluttering the
// only page that is supposed to tell Carl what is really out there.
//
// ⚠️ NOT for a school that has left. A real school's data is the school's, and
// SASA requires them to keep governance records; a departing school is
// SUSPENDED through its status, which stops access without destroying
// anything. This is for schools that should never have existed.
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const { key } = await params;

  // 🔴 The caller must type the school's key back. Not a confirm dialog on the
  // page, which the browser can be talked into by anything, but the actual
  // name, in the request body. It makes deleting the wrong school take a
  // deliberate act rather than a misplaced click on a row.
  let body: { confirm?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Treated as no confirmation, which is refused below.
  }
  if (body.confirm !== key) {
    return NextResponse.json(
      { error: `To remove this school, send its address "${key}" as confirmation.` },
      { status: 400 }
    );
  }

  const tenant = await getTenantByKey(key);
  if (!tenant) {
    return NextResponse.json({ error: "No school with that address" }, { status: 404 });
  }

  const removed = { blobs: 0, store: false, registry: false };
  const problems: string[] = [];

  // 1. The school's own data.
  //
  // Deleted with the school's OWN token and under its OWN prefix, which is
  // deliberate: it removes exactly what belongs to this school even where the
  // stored credential points at a store shared with something else. That is
  // not hypothetical - a provisioning bug once handed a school the control
  // store's token, and its data really did land under a prefix in there.
  if (tenant.blobTokenSealed) {
    try {
      const token = open(tenant.blobTokenSealed);
      const prefix = `${tenant.key}/`;
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, limit: 1000, cursor, token });
        for (const b of page.blobs) {
          await del(b.url, { token });
          removed.blobs += 1;
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
    } catch (err) {
      problems.push(
        `Could not clear the school's data: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 2. The Blob store itself, so it stops counting against the account ceiling.
  if (tenant.blobStoreId) {
    try {
      removed.store = await deleteBlobStore(tenant.blobStoreId);
      if (!removed.store) problems.push("The Blob store could not be deleted.");
    } catch (err) {
      problems.push(
        `Could not delete the Blob store: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 3. The registry, LAST.
  //
  // Order matters. While the registry entry survives, the school is still
  // findable and this can be run again to finish the job. Removing it first
  // would orphan the store and the data with nothing left pointing at them.
  try {
    await deleteTenant(key);
    removed.registry = true;
  } catch (err) {
    problems.push(
      `Could not remove the registry entry: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  console.warn(
    `[platform] ${admin.email} removed the school "${key}"`,
    JSON.stringify(removed)
  );

  return NextResponse.json({
    key,
    removed,
    // Reported rather than thrown. A partial removal is a real state and the
    // person who asked for it has to be able to see which part is left.
    problems: problems.length ? problems : undefined,
  });
}
