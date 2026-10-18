// The Roles page lists every permission the code defines, even for a school
// whose stored list predates it (book_rooms/manage_rooms were invisible until
// /api/seed was re-run per school). Fake blob store only.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-permissions-list.ts
export {};
for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "MULTI_TENANT"]) delete process.env[k];
process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";
(async () => {
  const { createRequire } = await import("module");
  const blob = createRequire(__filename)("@vercel/blob") as { __fakeStore?: () => unknown };
  if (typeof blob.__fakeStore !== "function") {
    console.error("Refusing to run: @vercel/blob is the REAL store.");
    process.exit(1);
  }
  const { savePermissions, getPermissions } = await import("../lib/rolesData");
  const { DEFAULT_PERMISSIONS } = await import("../lib/roles");
  // An old school: one renamed stock permission and one custom one, nothing else.
  await savePermissions([
    { key: "view_dashboard", name: "Renamed by the school", category: "Dashboard" },
    { key: "custom_x", name: "Custom", category: "Other" },
  ]);
  const keys = (await getPermissions()).map((p) => p.key);
  const fails = [
    ["book_rooms listed", keys.includes("book_rooms")],
    ["manage_rooms listed", keys.includes("manage_rooms")],
    ["every code permission listed", DEFAULT_PERMISSIONS.every((p) => keys.includes(p.key))],
    ["custom kept", keys.includes("custom_x")],
    ["no duplicates", new Set(keys).size === keys.length],
    ["school's rename wins", (await getPermissions()).find((p) => p.key === "view_dashboard")?.name === "Renamed by the school"],
  ].filter(([, ok]) => !ok);
  for (const [n] of fails) console.log("FAIL", n);
  console.log(fails.length ? `${fails.length} FAILED` : "All passed");
  process.exit(fails.length ? 1 : 0);
})();
