import type { SessionPayload } from "./roles";

// The gate for opening a piece of training lives in lib/trainingLearner.ts,
// shared by portal users and share-link guests.
export const canManageTraining = (s: SessionPayload) => s.permissions.includes("manage_training");
