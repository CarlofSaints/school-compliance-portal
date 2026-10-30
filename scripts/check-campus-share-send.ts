// Share links and Campus emails against the FAKE store: a guest reaches only
// what the link covers, the guest cookie is tied to its link, a send freezes
// its recipients and makes a link for typed addresses, and reminders go only
// to people who have not finished.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-campus-share-send.ts
import assert from "node:assert/strict";
process.env.AUTH_SECRET ||= "check-only-secret";
import { NextRequest, NextResponse } from "next/server";
import { createUser, updateUser } from "../lib/userData";
import { createItem, deleteItem, getModules, stamp, markOpened } from "../lib/trainingData";
import { LIBRARY, ensureLibraryDefaults } from "../lib/campusLibrary";
import { createShareLink, guestCookieValue, guestFromRequest, guestLearner, joinGuest, setShareActive, usableLink } from "../lib/campusShare";
import { handIn, openMaterial, openPaper } from "../lib/trainingLearner";
import { createSend, getSends, runCampusSends, sendNow } from "../lib/campusSends";
import { cleanQuestion, type Material, type Question, type Test, type TrainingModule } from "../lib/training";

const q = cleanQuestion({ type: "single", text: "SASA is Act?", options: [{ text: "84 of 1996", isCorrect: true }, { text: "32 of 2024" }] }) as Question;

(async () => {
  const lesson: Material = { ...stamp("u"), title: "L1", description: "", body: "word ".repeat(400), kind: "text", status: "published" };
  const other: Material = { ...stamp("u"), title: "Other", description: "", body: "x", kind: "text", status: "published" };
  const test: Test = { ...stamp("u"), title: "T1", description: "", status: "published", passMark: 70, maxAttempts: 0, showAnswers: true, questions: [q] };
  await createItem("material", lesson);
  await createItem("material", other);
  await createItem("test", test);
  const mod = await createItem<TrainingModule>("module", {
    ...stamp("u"), title: "M", description: "", topic: "", status: "published", sequential: true,
    items: [{ kind: "material", id: lesson.id }, { kind: "test", id: test.id }],
  });

  // --- Share link ------------------------------------------------------------
  const link = await createShareLink("module", mod.id, "parents", "", "u");
  assert.ok(await usableLink(link.token));
  const guest = await joinGuest(link.token, "Pat", "Parent", "Pat@Example.com");
  assert.notEqual((await joinGuest(link.token, "P", "P", "pat@example.com")).id, guest.id, "typing an email already on the link never hands over that guest");
  const learner = await guestLearner(link, guest);
  assert.equal((await openMaterial(learner, other.id)).ok, false, "a guest cannot open training outside the link");
  const locked = await openPaper(learner, test.id);
  assert.ok(!locked.ok && locked.status === 403, "the module's order still applies to a guest");
  assert.ok((await openMaterial(learner, lesson.id)).ok);
  const out = await handIn(learner, test.id, { [q.id]: q.options[0].id });
  assert.ok(out.ok && out.body.passed, "a guest can sit and pass the test");

  // A link to ONE step of an in-order module: the module's earlier step (outside the link) must not lock it.
  const testOnly = await createShareLink("test", test.id, "", "", "u");
  const solo = await guestLearner(testOnly, await joinGuest(testOnly.token, "Sam", "Solo", "sam@x.example"));
  assert.ok((await openPaper(solo, test.id)).ok, "a single-test link is not held behind a lesson the guest cannot open");

  // The guest cookie only works on its own link.
  const value = await guestCookieValue(link.token, guest.id);
  const res = NextResponse.json({});
  const req = (name: string, v: string) => new NextRequest("https://demo.test/x", { headers: { cookie: `${name}=${v}` } });
  assert.equal((await guestFromRequest(req(`sc_campus_guest_${link.token}`, value), link.token))?.id, guest.id);
  assert.equal(await guestFromRequest(req(`sc_campus_guest_${link.token}`, value.replace(/.$/, "x")), link.token), null, "a tampered cookie is refused");
  const other2 = await createShareLink("material", other.id, "", "", "u");
  assert.equal(await guestFromRequest(req(`sc_campus_guest_${other2.token}`, value), other2.token), null, "a cookie from one link does not open another");
  void res;
  await setShareActive(link.token, false);
  assert.equal(await usableLink(link.token), null, "a switched-off link stops working");

  // --- Sends -----------------------------------------------------------------
  await createUser({ id: "a", name: "Ann", surname: "A", email: "ann@x.example", password: "x".repeat(12), role: "sgb-member", forcePasswordChange: false });
  await createUser({ id: "b", name: "Ben", surname: "B", email: "ben@x.example", password: "x".repeat(12), role: "sgb-member", forcePasswordChange: false });
  await createUser({ id: "c", name: "Cid", surname: "C", email: "cid@x.example", password: "x".repeat(12), role: "sgb-member", forcePasswordChange: false });
  await updateUser("c", { termLocked: true });
  const send = await createSend({
    kind: "material", targetId: lesson.id, title: lesson.title, subject: "Read this", message: "Please", everyone: true, userIds: [],
    externalEmails: ["out@side.example", "ann@x.example", "cid@x.example"], sendOn: "2026-10-30", remindEveryDays: 3, remindMax: 2, createdBy: "u", createdByName: "Carl",
  });
  const done = await sendNow(send.id);
  assert.equal(await sendNow(send.id), null, "a send goes out once");
  assert.deepEqual(done!.recipients!.map((r) => r.email).sort(), ["ann@x.example", "ben@x.example", "out@side.example"], "everyone plus the typed address, no duplicates, and a locked member's typed address is NOT let in by link");
  assert.ok(done!.shareToken, "a share link was made for the typed address");

  await markOpened("a", lesson.id); // Ann read it; Ben and the outsider did not
  const lines = await runCampusSends("2026-11-02");
  assert.ok(lines.some((l) => l.includes("reminded 2")), `reminded the two who have not read it: ${lines.join(" | ")}`);
  assert.equal((await runCampusSends("2026-11-02")).length, 0, "one reminder a day at most");
  const after = (await getSends()).find((s) => s.id === send.id)!;
  assert.equal(after.remindersSent, 1);

  const later = await createSend({ kind: "test", targetId: test.id, title: test.title, subject: "Later", message: "", everyone: false, userIds: ["b"], externalEmails: [], sendOn: "2026-12-01", remindEveryDays: 0, remindMax: 0, createdBy: "u", createdByName: "Carl" });
  assert.equal((await runCampusSends("2026-11-30")).filter((l) => l.includes("Later")).length, 0, "not before its date");
  assert.ok((await runCampusSends("2026-12-01")).some((l) => l.includes('sent "T1"')), "goes out on its date");
  void later;

  // --- Library by default ------------------------------------------------------
  assert.equal(await ensureLibraryDefaults(), LIBRARY.length, "a school gets every library course");
  assert.equal(await ensureLibraryDefaults(), 0, "only once");
  const bela = (await getModules()).find((m) => m.librarySlug === LIBRARY[0].slug)!;
  await deleteItem("module", bela.id);
  assert.equal(await ensureLibraryDefaults(), 0, "a course the school deleted is not added again");
  console.log("campus share + send: all checks passed");
})();
