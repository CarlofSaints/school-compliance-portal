import { NextResponse } from "next/server";
import { readJson, writeJson, updateJson, deleteFile } from "@/lib/controlData";

// TEMPORARY proof for batch 3, removed before merge. Preview deployments only
// (those sit behind Vercel's own login); 404 everywhere else.
//
// Ten saves at once to a scratch file, the old way (read then write) and the
// new way (updateJson). The old way should lose most of them; the new way
// must keep all ten.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const N = 10;
  const stamp = Date.now();
  const oldPath = `_ci/concurrency-old-${stamp}.json`;
  const newPath = `_ci/concurrency-new-${stamp}.json`;

  await writeJson(oldPath, { ids: [] as number[] });
  await writeJson(newPath, { ids: [] as number[] });

  await Promise.all(
    Array.from({ length: N }, async (_, i) => {
      const cur = await readJson<{ ids: number[] }>(oldPath, { ids: [] });
      cur.ids.push(i);
      await writeJson(oldPath, cur);
    })
  );

  const t0 = Date.now();
  const outcomes = await Promise.allSettled(
    Array.from({ length: N }, (_, i) =>
      updateJson<{ ids: number[] }>(newPath, { ids: [] }, (cur) => ({ ids: [...cur.ids, i] }), 12)
    )
  );
  const ms = Date.now() - t0;

  // Brand-new file, created by ten at once.
  const createPath = `_ci/concurrency-create-${stamp}.json`;
  const created = await Promise.allSettled(
    Array.from({ length: N }, (_, i) =>
      updateJson<{ ids: number[] }>(createPath, { ids: [] }, (cur) => ({ ids: [...cur.ids, i] }), 12)
    )
  );

  await new Promise((r) => setTimeout(r, 1500));
  const oldFinal = await readJson<{ ids: number[] }>(oldPath, { ids: [] });
  const newFinal = await readJson<{ ids: number[] }>(newPath, { ids: [] });
  const createFinal = await readJson<{ ids: number[] }>(createPath, { ids: [] });
  await Promise.all([deleteFile(oldPath), deleteFile(newPath), deleteFile(createPath)]);

  return NextResponse.json({
    saves: N,
    oldWay: { kept: oldFinal.ids.length, ids: oldFinal.ids.sort((a, b) => a - b) },
    newWay: {
      kept: newFinal.ids.length,
      ids: newFinal.ids.sort((a, b) => a - b),
      failed: outcomes.filter((o) => o.status === "rejected").map((o) => String((o as PromiseRejectedResult).reason)),
      ms,
    },
    newFile: {
      kept: createFinal.ids.length,
      failed: created.filter((o) => o.status === "rejected").map((o) => String((o as PromiseRejectedResult).reason)),
    },
  });
}
