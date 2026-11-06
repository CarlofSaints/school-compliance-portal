// Staff rules and loading. Fake blob store only.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-staff.ts
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
  const { checkRows, cleanRow, parseType, rowsFromGrid } = await import("../lib/staff");
  const { loadStaff } = await import("../lib/staffData");
  const { createUser, getUsers, getUserRecord } = await import("../lib/userData");
  const { getPeople, createPerson, deletePerson } = await import("../lib/peopleData");
  const { usersToLock } = await import("../lib/governanceTerm");
  const { weeklyRecipients } = await import("../lib/weeklyUpdateData");

  let failed = 0;
  const check = (name: string, ok: boolean) => {
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  };

  const roles = [{ id: "teacher", name: "Teacher" }, { id: "admin", name: "SGB Admin" }, { id: "super-admin", name: "Super Admin" }];
  const row = (o: Record<string, string>, n = 2) => ({ ...cleanRow({ email: "a@school.co.za", name: "Ann", surname: "Lee", role: "teacher", type: "State Teacher", sace: "123", persal: "12345678", ...o }), row: n });
  const ctx = { roles, users: [] as { id: string; email: string; role: string; name: string; surname: string }[], within: (id: string) => id !== "admin" };
  const one = (o: Record<string, string>) => checkRows([row(o)], ctx)[0];

  check("clean row passes, role matched ignoring case", !one({}).problems.length && one({}).roleId === "teacher");
  check("missing role flagged for the link", one({ role: "Coach" }).roleMissing && /does not exist/.test(one({ role: "Coach" }).problems[0]));
  check("SACE mandatory", one({ sace: "" }).problems.some((p: string) => /SACE/.test(p)));
  check("Persal mandatory for State", one({ persal: "" }).problems.some((p: string) => /Persal/.test(p)));
  check("Persal optional for SGB", !one({ persal: "", type: "SGB or Board Teacher" }).problems.length);
  check("Persal digits only", one({ persal: "12A" }).problems.length === 1);
  check("bad type refused", one({ type: "Part time" }).problems.length === 1);
  check("bad email refused", one({ email: "nope" }).problems.length === 1);
  check("Super Admin refused", one({ role: "super admin" }).problems.length === 1);
  check("role beyond reach refused", one({ role: "SGB Admin" }).problems.length === 1);
  check("same email twice refused on the second", checkRows([row({}, 2), row({ email: "A@school.co.za " }, 3)], ctx)[1].problems.length === 1);
  check("a coach needs no SACE or Persal", !one({ type: "Coach", sace: "", persal: "" }).problems.length);
  check("a teacher still needs SACE, an SGB one too", one({ type: "SGB or Board Teacher", sace: "", persal: "" }).problems.length === 1);
  check("the first template still loads", rowsFromGrid([["Email address *", "Name *", "Surname *", "Role *", "SGB or State *", "SACE number *", "Persal number *"]]).missing.length === 0);
  check("a teacher who coaches stays a teacher", parseType("State Teacher and Coach") === "state" && parseType("SGB Teacher / Coach") === "sgb" && parseType("Teacher and coach") === null);
  check("SGB Coach reads as a coach", parseType("SGB Coach") === "coach");
  check("a bad type does not ask for SACE", one({ type: "Coah", sace: "" }).problems.length === 1);
  check("a coaches sheet needs no number columns", rowsFromGrid([["Email address", "Name", "Surname", "Role", "Staff type"]]).missing.length === 0);
  check("short type words read", parseType("State") === "state" && parseType("SGB") === "sgb" && parseType("Board") === "sgb");
  check("invalid row carries no details", one({ sace: "" }).details === null);

  const parsed = rowsFromGrid([
    ["Staff list"],
    ["Surname *", "Email address", "Name", "Role", "SGB or State", "SACE", "Persal number", "Grades"],
    ["Lee", "A@School.co.za", "Ann", "Teacher", "State Teacher", "99", "12345678", "4, 5"],
    ["", "", "", "", "", "", "", ""],
    ["Ngo", "b@school.co.za", "Bo", "Teacher", "SGB", "98", "", ""],
  ]);
  check("header found, any order, Excel row numbers kept", parsed.rows.length === 2 && parsed.rows[0].row === 3 && parsed.rows[1].row === 5);
  check("cells land in the right fields", parsed.rows[0].surname === "Lee" && parsed.rows[0].email === "a@school.co.za" && parsed.rows[0].grade === "4, 5" && parsed.rows[0].sace === "99");
  check("missing column named", rowsFromGrid([["Email address", "Name"]]).missing.includes("Surname"));
  check("two first names stay together", checkRows([row({ name: "Mary Anne", surname: "Lee" })], ctx)[0].firstName === "Mary Anne");

  await createUser({ id: "gov", name: "Gov", surname: "Ernor", email: "gov@school.co.za", password: "x", role: "admin", forcePasswordChange: false });
  await createPerson({ id: "p1", position: "Teacher", userId: null, name: "Ann Lee", email: "a@school.co.za", phone: "", profilePic: "" });
  await createPerson({ id: "p2", position: "Deputy Principal", userId: null, name: "Dee Puty", email: "dee@school.co.za", phone: "", profilePic: "" });
  const live = { ...ctx, users: await getUsers(), within: () => true };
  const first = checkRows([row({}), row({ email: "b@school.co.za", name: "Bo", surname: "de Wet" }, 3), row({ email: "gov@school.co.za", name: "", surname: "", role: "Coach", subject: "Tennis" }, 4)], live);
  check("existing user is an update, role column ignored", first[2].action === "update" && !first[2].problems.length);
  const done = await loadStaff(first);
  check("two added, one updated", done.added === 2 && done.updated === 1);

  const users = await getUsers();
  const ann = users.find((u) => u.email === "a@school.co.za")!;
  const bo = users.find((u) => u.email === "b@school.co.za")!;
  const gov = users.find((u) => u.id === "gov")!;
  const people = await getPeople();
  check("a double-barrelled surname survives", bo.name === "Bo" && bo.surname === "de Wet");
  check("own copy written", (await getUserRecord(bo.id))?.staff?.sace === "123");
  check("must set a password", ann.forcePasswordChange === true && !!ann.password);
  check("end of term does not lock staff", usersToLock([ann, bo]).length === 0);
  check("existing user keeps role and gets details", gov.role === "admin" && gov.staff?.subject === "Tennis");
  check("unlinked register entry is linked, not doubled", people.filter((p) => p.email === "a@school.co.za").length === 1 && people.find((p) => p.id === "p1")?.userId === ann.id);
  check("new register entry is staff only, position is the role", people.some((p) => p.userId === bo.id && p.staffOnly && p.position === "Staff"));
  check("existing user gets a register entry too", people.filter((p) => p.userId === "gov").length === 1);

  const again = await loadStaff(checkRows([row({})], { ...live, users: await getUsers() }));
  check("a different name on an existing address is refused", checkRows([row({ email: "gov@school.co.za", name: "John", surname: "Smith" })], live)[0].problems.some((p: string) => /belongs to Gov Ernor/.test(p)));
  check("the existing person's register name is the account's", people.find((p) => p.userId === "gov")?.name === "Gov Ernor");
  await loadStaff(checkRows([row({ email: "dee@school.co.za", name: "Dee", surname: "Puty" })], { ...live, users: await getUsers() }));
  check("an upload never links a Deputy Principal entry", !(await getPeople()).find((p) => p.id === "p2")?.userId);
  await loadStaff(checkRows([row({ email: "gov@school.co.za", name: "", surname: "", type: "Coach", sace: "", persal: "", subject: "Tennis" })], { ...live, users: await getUsers() }));
  const kept = (await getUsers()).find((u) => u.id === "gov")!.staff!;
  check("blank cells on a Coach row keep the stored numbers", kept.type === "coach" && kept.sace === "123" && kept.persal === "12345678");
  await loadStaff(checkRows([row({ email: "gov@school.co.za", name: "", surname: "", subject: "Tennis" })], { ...live, users: await getUsers() }));
  const before = (await getUsers()).find((u) => u.id === "gov")!.updatedAt;
  const quiet = await loadStaff(checkRows([row({ email: "gov@school.co.za", name: "", surname: "", subject: "Tennis" })], { ...live, users: await getUsers() }));
  check("a row that changes nothing writes nothing", quiet.updated === 0 && (await getUsers()).find((u) => u.id === "gov")!.updatedAt === before);
  const weekly = (await weeklyRecipients()).recipients.map((r) => r.email);
  check("a teacher gets no weekly update", !weekly.includes("b@school.co.za"));
  await createPerson({ id: "p3", position: "Co-opted SGB", userId: bo.id, name: "Bo de Wet", email: "b@school.co.za", phone: "", profilePic: "" });
  check("a teacher with an SGB seat does", (await weeklyRecipients()).recipients.some((r) => r.email === "b@school.co.za"));
  await deletePerson("p3");
  check("loading the same file again adds nobody", again.added === 0 && (await getPeople()).length === people.length && (await getUsers()).length === users.length + 1);

  console.log(failed ? `${failed} FAILED` : "all passed");
  process.exit(failed ? 1 : 0);
})();
