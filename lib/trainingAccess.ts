import { NextResponse } from "next/server";
import type { SessionPayload } from "./roles";
import { isLocked, liveKeys, type ModuleItem, type Progress, type TrainingStatus } from "./training";
import { getMaterials, getModules, getTests } from "./trainingData";

export const canManageTraining = (s: SessionPayload) => s.permissions.includes("manage_training");

/**
 * The one gate for opening a piece of training. Drafts are for the people who
 * build training; a piece locked by a module set to run in order stays shut
 * until the steps before it are done (managers may look anyway, to check it).
 * Null means go ahead.
 */
export async function trainingGate(
  session: SessionPayload,
  item: (ModuleItem & { status: TrainingStatus }) | null,
  progress: Progress
): Promise<NextResponse | null> {
  const manager = canManageTraining(session);
  if (!item || (item.status !== "published" && !manager)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!manager) {
    const [modules, materials, tests] = await Promise.all([getModules(), getMaterials(), getTests()]);
    if (!isLocked(progress, modules, item, liveKeys(materials, tests))) return null;
    return NextResponse.json({ error: "Finish the earlier steps of this module first." }, { status: 403 });
  }
  return null;
}
