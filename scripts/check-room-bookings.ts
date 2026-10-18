// Checks the meeting-room bookings rules (lib/roomBookingData.ts) against the
// FAKE blob store: clashes, back-to-back, any hour of the day, repeat series
// rolling back, cancel one vs series, who may edit/cancel, deleting a room,
// asking the holder for the room, and the day-before reminder claim.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-room-bookings.ts

export {};

for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "RESEND_API_KEY", "ANTHROPIC_API_KEY", "TENANT_SECRET", "MULTI_TENANT"]) {
  delete process.env[k];
}
process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
}

async function main() {
  const { createRequire } = await import("module");
  const blob = createRequire(__filename)("@vercel/blob") as { __fakeStore?: () => unknown };
  if (typeof blob.__fakeStore !== "function") {
    console.error("Refusing to run: @vercel/blob is the REAL store. Run with --import ./scripts/fake-blob/register.mjs");
    process.exit(1);
  }
  // Emails only log without a key; keep the output readable.
  // Without a key the mailer logs "[Email] Would send to <to>: <subject>"; record those as the outbox.
  const outbox: { to: string; subject: string }[] = [];
  console.log = ((orig) => (...a: unknown[]) => {
    const m = /^\[Email\] Would send to (.+?): (.*)$/.exec(String(a[0]));
    if (m) outbox.push({ to: m[1], subject: m[2] });
    return String(a[0]).startsWith("[Email]") ? undefined : orig(...a);
  })(console.log);
  const mailTo = (to: string, part: string) => outbox.filter((m) => m.to === to && m.subject.includes(part)).length;

  const D = await import("../lib/roomBookingData");
  const { readJson } = await import("../lib/controlData");
  const { createUser } = await import("../lib/userData");
  const { runRoomBookingReminders } = await import("../lib/roomBookingNotify");
  const { isPast: isPastFn } = await import("../lib/roomBookings");
  type Booking = import("../lib/roomBookingData").RoomBooking;

  // Roles first: approving checks the requester still holds book_rooms.
  await (await import("../lib/rolesData")).saveRoles((await import("../lib/roles")).DEFAULT_ROLES);
  for (const [id, name] of [["alice", "Alice"], ["bob", "Bob"], ["cara", "Cara"]]) {
    await createUser({ id, name, surname: "Tester", email: `${id}@example.test`, password: "pw", role: "sgb-member", forcePasswordChange: false, tagIds: [] });
  }
  const actor = (id: string, permissions: string[]) => ({ id, name: `${id} Tester`, email: `${id}@example.test`, permissions });
  const alice = actor("alice", ["book_rooms"]);
  const bob = actor("bob", ["book_rooms"]);
  const cara = actor("cara", ["book_rooms"]);
  const admin = actor("admin", ["manage_rooms"]);

  // --- rooms
  check("booker cannot create a room", (await D.saveRoom(alice, null, { name: "Hall", capacity: 10, color: "#0d9488", notes: "" })).ok, false);
  const made = await D.saveRoom(admin, null, { name: "Boardroom", capacity: 12, color: "#0d9488", notes: "Projector" });
  if (!made.ok) throw new Error("room create failed");
  const room = made.value.room;
  check("duplicate room name refused", (await D.saveRoom(admin, null, { name: "boardroom", capacity: 4, color: "#0d9488", notes: "" })).ok, false);
  check("room input validation: capacity 0 refused", D.parseRoomInput({ name: "X", capacity: 0 }).ok, false);

  const input = (date: string, start: string, end: string, extra: Record<string, unknown> = {}) => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const p = D.parseBookingInput({ roomId: room.id, title: "Meeting", date, startMinute: sh * 60 + sm, endMinute: eh * 60 + em, attendeeCount: 4, ...extra });
    if (!p.ok) throw new Error(`bad input ${date} ${start}-${end}: ${p.error}`);
    return p.value;
  };
  const status = (o: { ok: boolean; status?: number }) => (o.ok ? "ok" : o.status);

  // --- clashes and hours
  const b1 = await D.createBooking(alice, input("2027-03-10", "09:00", "10:00"));
  check("first booking accepted", status(b1), "ok");
  check("overlapping booking refused (409)", status(await D.createBooking(bob, input("2027-03-10", "09:30", "10:30"))), 409);
  check("back-to-back booking allowed", status(await D.createBooking(bob, input("2027-03-10", "10:00", "11:00"))), "ok");
  check("05:00-06:00 accepted", status(await D.createBooking(bob, input("2027-03-11", "05:00", "06:00"))), "ok");
  check("21:00-23:30 accepted", status(await D.createBooking(bob, input("2027-03-11", "21:00", "23:30"))), "ok");
  check("until midnight (24:00) accepted", D.parseBookingInput({ roomId: room.id, title: "x", date: "2027-03-12", startMinute: 1380, endMinute: 1440, attendeeCount: 1 }).ok, true);
  check("end before start refused", D.parseBookingInput({ roomId: room.id, title: "x", date: "2027-03-12", startMinute: 600, endMinute: 540, attendeeCount: 1 }).ok, false);
  check("minute past the day refused", D.parseBookingInput({ roomId: room.id, title: "x", date: "2027-03-12", startMinute: 600, endMinute: 1441, attendeeCount: 1 }).ok, false);
  check("impossible date refused", D.parseBookingInput({ roomId: room.id, title: "x", date: "2027-02-30", startMinute: 600, endMinute: 660, attendeeCount: 1 }).ok, false);
  check("over capacity refused", status(await D.createBooking(alice, input("2027-03-12", "09:00", "10:00", { attendeeCount: 13 }))), 400);
  check("no book_rooms: refused", status(await D.createBooking(admin, input("2027-03-12", "09:00", "10:00"))), 403);

  // --- repeat series across months
  const weekly = (count: number) => ({ frequency: "weekly", interval: 1, weekdays: [], endMode: "count", count, until: "" });
  await D.createBooking(cara, input("2027-05-05", "14:00", "15:00"));
  const s1 = await D.createBooking(alice, input("2027-04-21", "14:00", "15:00", { recurrence: weekly(4) })); // Apr 21, 28, May 5, 12
  check("series clashing in a later month refused", status(s1), 409);
  const april = await readJson<Booking[]>(`rooms/bookings/${room.id}/2027-04.json`, []);
  check("refused series wrote nothing", april.length, 0);

  // Two series racing for one May slot: exactly one wins, the loser leaves no trace.
  const [ra, rb] = await Promise.all([
    D.createBooking(alice, input("2027-06-23", "08:00", "09:00", { recurrence: weekly(3), title: "Race A" })), // Jun 23, 30, Jul 7
    D.createBooking(bob, input("2027-06-16", "08:00", "09:00", { recurrence: weekly(4), title: "Race B" })), // Jun 16, 23, 30, Jul 7
  ]);
  check("racing series: exactly one wins", [ra.ok, rb.ok].filter(Boolean).length, 1);
  const raced = [
    ...(await readJson<Booking[]>(`rooms/bookings/${room.id}/2027-06.json`, [])),
    ...(await readJson<Booking[]>(`rooms/bookings/${room.id}/2027-07.json`, [])),
  ];
  const loser = ra.ok ? "Race B" : "Race A";
  check("racing series: loser rolled back in every month", raced.filter((b) => b.title === loser).length, 0);
  check("racing series: no double-booked slot", new Set(raced.map((b) => b.date)).size, raced.length);

  // Deterministic version of the race: somebody books a December slot AFTER the
  // series passed its check but BEFORE it writes December. November was already
  // written, so it must be undone.
  const store = (blob.__fakeStore as () => Map<string, { bytes: Buffer; etag: string; contentType: string; uploadedAt: Date }>)();
  const decKey = [...store.keys()].find((k) => k.includes(`rooms/bookings/${room.id}/`))!.replace(/\d{4}-\d{2}\.json$/, "2027-12.json");
  const origGet = store.get.bind(store);
  let decReads = 0;
  store.get = (k: string) => {
    if (k === decKey && ++decReads === 2) {
      const sneak = { ...(raced[0] as Booking), id: "sneak", date: "2027-12-01", title: "Sneaked in", status: "confirmed", requests: [] };
      store.set(decKey, { bytes: Buffer.from(JSON.stringify([sneak])), etag: '"sneak"', contentType: "application/json", uploadedAt: new Date() });
    }
    return origGet(k);
  };
  const s3 = await D.createBooking(alice, input("2027-11-24", "08:00", "09:00", { recurrence: weekly(2), title: "Rolled" })); // Nov 24, Dec 1
  store.get = origGet;
  check("series clashing mid-write refused", status(s3), 409);
  check("series clashing mid-write: earlier month undone", (await readJson<Booking[]>(`rooms/bookings/${room.id}/2027-11.json`, [])).filter((b) => b.title === "Rolled").length, 0);

  // --- cancel one vs series
  const s2 = await D.createBooking(alice, input("2027-08-02", "12:00", "13:00", { recurrence: weekly(4), title: "Weekly" })); // Aug 2, 9, 16, 23
  if (!s2.ok) throw new Error("series create failed");
  const [o1, o2, o3] = s2.value.bookings;
  check("non-holder cannot cancel", status(await D.cancelBooking(bob, room.id, o2.date, o2.id, "one")), 403);
  check("cancel one", status(await D.cancelBooking(alice, room.id, o2.date, o2.id, "one")), "ok");
  const aug1 = (await readJson<Booking[]>(`rooms/bookings/${room.id}/2027-08.json`, [])).filter((b) => b.seriesId === o1.seriesId);
  check("cancel one leaves the rest", aug1.map((b) => b.status), ["confirmed", "cancelled", "confirmed", "confirmed"]);
  const cs = await D.cancelBooking(alice, room.id, o3.date, o3.id, "series");
  check("cancel series from a later one cancels it and the ones after", cs.ok && cs.value.count, 2);
  const aug2 = (await readJson<Booking[]>(`rooms/bookings/${room.id}/2027-08.json`, [])).filter((b) => b.seriesId === o1.seriesId);
  check("cancel series leaves EARLIER upcoming ones alone", aug2.map((b) => b.status), ["confirmed", "cancelled", "cancelled", "cancelled"]);

  // --- edit
  const mine = b1.ok ? b1.value.bookings[0] : null!;
  check("non-holder cannot edit", status(await D.updateBooking(bob, mine.id, mine.date, input("2027-03-10", "09:00", "09:45"))), 403);
  check("edit into a clash refused", status(await D.updateBooking(alice, mine.id, mine.date, input("2027-03-10", "09:00", "10:30"))), 409);
  const moved = await D.updateBooking(alice, mine.id, mine.date, input("2027-04-01", "09:00", "10:00", { bookedForId: "cara" }));
  check("edit moves to another month and hands to Cara", moved.ok && [moved.value.after.date, moved.value.holderChanged, moved.value.after.bookedForName], ["2027-04-01", true, "Cara Tester"]);
  check("moved booking left its old month", (await D.findBooking(room.id, "2027-03-10", mine.id)) === null, true);
  check("manage_rooms can edit anyone's", status(await D.updateBooking(admin, mine.id, "2027-04-01", input("2027-04-01", "09:00", "10:30", { bookedForId: "cara" }))), "ok");

  // --- ask the holder for the room
  const held = await D.createBooking(alice, input("2027-09-01", "10:00", "11:00", { title: "Alice's" }));
  if (!held.ok) throw new Error("create failed");
  const hb = held.value.bookings[0];
  check("holder cannot ask for own room", status(await D.requestRoom(alice, room.id, hb.date, hb.id, { title: "x", message: "y", attendeeCount: 2 })), 400);
  const q1 = await D.requestRoom(bob, room.id, hb.date, hb.id, { title: "Bob's", message: "Parents evening", attendeeCount: 6 });
  if (!q1.ok) throw new Error("request failed");
  check("second live request by the same person refused", status(await D.requestRoom(bob, room.id, hb.date, hb.id, { title: "x", message: "y", attendeeCount: 2 })), 409);
  check("requester can view, cannot answer", (await D.getRequestView(bob, q1.value.request.token)).ok && (await D.getRequestView(bob, q1.value.request.token) as { value: { canAnswer: boolean } }).value.canAnswer, false);
  check("outsider cannot even view", status(await D.getRequestView(cara, q1.value.request.token)), 403);
  check("non-holder cannot answer", status(await D.respondToRequest(bob, q1.value.request.token, "approve", "")), 403);
  check("decline needs a reason", status(await D.respondToRequest(alice, q1.value.request.token, "decline", "  ")), 400);
  check("decline", status(await D.respondToRequest(alice, q1.value.request.token, "decline", "Board meeting")), "ok");
  const afterDecline = await D.findBooking(room.id, hb.date, hb.id);
  check("decline leaves the booking with the holder", [afterDecline?.bookedById, afterDecline?.title], ["alice", "Alice's"]);
  check("answered twice refused", status(await D.respondToRequest(alice, q1.value.request.token, "approve", "")), 409);

  const q2 = await D.requestRoom(bob, room.id, hb.date, hb.id, { title: "Bob again", message: "Please", attendeeCount: 6 });
  const q3 = await D.requestRoom(cara, room.id, hb.date, hb.id, { title: "Cara's", message: "Me too", attendeeCount: 2 });
  if (!q2.ok || !q3.ok) throw new Error("request failed");
  check("accept", status(await D.respondToRequest(alice, q2.value.request.token, "approve", "")), "ok");
  const afterAccept = await D.findBooking(room.id, hb.date, hb.id);
  check("accept moves the booking to the requester, same slot", [afterAccept?.bookedById, afterAccept?.title, afterAccept?.startMinute, afterAccept?.status], ["bob", "Bob again", 600, "confirmed"]);
  check("other pending requests withdrawn", afterAccept?.requests.find((r) => r.token === q3.value.request.token)?.status, "withdrawn");
  check("old holder can no longer cancel it", status(await D.cancelBooking(alice, room.id, hb.date, hb.id, "one")), 403);
  check("manage_rooms can cancel anyone's", status(await D.cancelBooking(admin, room.id, hb.date, hb.id, "one")), "ok");

  // --- reminders
  const tom = await D.createBooking(alice, input("2027-10-05", "08:00", "09:00", { bookedForId: "cara" }));
  if (!tom.ok) throw new Error("create failed");
  const runAt = new Date("2027-10-05T05:00:00Z"); // 07:00 run on the day, meeting at 08:00
  const rem = await runRoomBookingReminders(runAt);
  check("reminder sent to both holders", [rem.due, rem.sent], [1, 2]);
  check("reminder not sent twice", (await runRoomBookingReminders(runAt)).due, 0);

  // --- deleting a room
  const spare = await D.saveRoom(admin, null, { name: "Spare", capacity: 4, color: "#4f46e5", notes: "" });
  if (!spare.ok) throw new Error("room create failed");
  check("booker cannot delete a room", status(await D.deleteRoom(alice, spare.value.room.id)), 403);
  const del1 = await D.deleteRoom(admin, spare.value.room.id);
  check("never-booked room is deleted", del1.ok && del1.value.retired, false);
  check("deleted room gone", await D.getRoom(spare.value.room.id), null);
  const del2 = await D.deleteRoom(admin, room.id);
  check("booked room is retired, not deleted", [del2.ok && del2.value.retired, (await D.getRoom(room.id))?.active], [true, false]);
  check("retired room takes no new bookings", status(await D.createBooking(alice, input("2027-11-01", "09:00", "10:00"))), 400);

  // ======================= review fixes =======================
  const { writeJson } = await import("../lib/controlData");
  const { safeNextPath, loginUrlFor } = await import("../lib/nextPath");
  const { LIMITS } = await import("../lib/rateLimit");
  const mkRoom = async (name: string) => {
    const r = await D.saveRoom(admin, null, { name, capacity: 10, color: "#0d9488", notes: "" });
    if (!r.ok) throw new Error("room create failed");
    return r.value.room;
  };
  const inp = (roomId: string, date: string, s: number, e: number, extra: Record<string, unknown> = {}) => {
    const p = D.parseBookingInput({ roomId, title: "Meeting", date, startMinute: s, endMinute: e, attendeeCount: 2, ...extra });
    if (!p.ok) throw new Error(p.error);
    return p.value;
  };

  // #4 past dates and times
  const lab = await mkRoom("Lab");
  const noon = new Date("2027-03-10T10:00:00Z"); // 12:00 SAST
  check("#4 a past date is refused", status(await D.createBooking(alice, inp(lab.id, "2027-03-09", 600, 660), noon)), 400);
  check("#4 earlier today is refused", status(await D.createBooking(alice, inp(lab.id, "2027-03-10", 540, 600), noon)), 400);
  const later = await D.createBooking(alice, inp(lab.id, "2027-03-10", 720, 780), noon);
  check("#4 later today is accepted", status(later), "ok");
  if (!later.ok) throw new Error("create failed");
  const lb = later.value.bookings[0];
  const pastOne = new Date("2027-03-10T10:30:00Z"); // 12:30 SAST, the meeting is under way
  check("#4 editing an under-way meeting's title is allowed", status(await D.updateBooking(alice, lb.id, lb.date, inp(lab.id, "2027-03-10", 720, 780, { title: "Renamed" }), pastOne)), "ok");
  check("#4 moving a booking into the past is refused", status(await D.updateBooking(alice, lb.id, lb.date, inp(lab.id, "2027-03-09", 720, 780), pastOne)), 400);
  check("#4 isPast at the minute", [isPastFn("2027-03-10", 719, noon), isPastFn("2027-03-10", 720, noon)], [true, false]);

  // #6 a request link survives its booking moving to another month
  const mv = await D.createBooking(alice, inp(lab.id, "2027-09-10", 600, 660));
  if (!mv.ok) throw new Error("create failed");
  const mb = mv.value.bookings[0];
  const mq = await D.requestRoom(bob, lab.id, mb.date, mb.id, { title: "Bob's", message: "Please", attendeeCount: 2 });
  if (!mq.ok) throw new Error("request failed");
  await D.respondToRequest(alice, mq.value.request.token, "decline", "Need it");
  check("#6 cross-month move", status(await D.updateBooking(alice, mb.id, mb.date, inp(lab.id, "2027-10-12", 600, 660))), "ok");
  const view = await D.getRequestView(alice, mq.value.request.token);
  check("#6 request page still opens after the move", view.ok && [view.value.booking.date, view.value.request.status], ["2027-10-12", "declined"]);

  // #8 + #3 a room retired by hand (simulating a race) refuses edits, requests, reminders
  const tb = await D.createBooking(alice, inp(lab.id, "2027-12-15", 600, 660));
  if (!tb.ok) throw new Error("create failed");
  const tbk = tb.value.bookings[0];
  const all = await readJson<import("../lib/roomBookingData").Room[]>("rooms/rooms.json", []);
  await writeJson("rooms/rooms.json", all.map((r) => (r.id === lab.id ? { ...r, active: false } : r)));
  check("#8 retired room: edit refused", status(await D.updateBooking(alice, tbk.id, tbk.date, inp(lab.id, "2027-12-15", 600, 700))), 400);
  check("#8 retired room: asking for it refused", status(await D.requestRoom(bob, lab.id, tbk.date, tbk.id, { title: "x", message: "y", attendeeCount: 1 })), 404);
  check("#3 retired room: no reminder", (await D.bookingsDueForReminder(new Date("2027-12-14T05:00:00Z"))).some((x) => x.booking.id === tbk.id), false);

  // #3 retiring cancels upcoming bookings (not past ones) and says which
  const hall = await mkRoom("Hall");
  const old = await D.createBooking(alice, inp(hall.id, "2026-01-05", 600, 660), new Date("2026-01-01T00:00:00Z"));
  const fut = await D.createBooking(alice, inp(hall.id, "2027-12-20", 600, 660, { bookedForId: "cara" }));
  if (!old.ok || !fut.ok) throw new Error("create failed");
  const ret = await D.saveRoom(admin, hall.id, { name: "Hall", capacity: 10, color: "#0d9488", notes: "", active: false });
  check("#3 retiring cancels the upcoming booking only", ret.ok && ret.value.cancelled.map((b) => b.id), [fut.value.bookings[0].id]);
  check("#3 upcoming booking now cancelled", (await D.findBooking(hall.id, "2027-12-20", fut.value.bookings[0].id))?.status, "cancelled");
  check("#3 past booking kept", (await D.findBooking(hall.id, "2026-01-05", old.value.bookings[0].id))?.status, "confirmed");
  const { notifyRoomRetired } = await import("../lib/roomBookingNotify");
  check("#3 holders emailed (no failures)", ret.ok && (await notifyRoomRetired(ret.value.cancelled, ret.value.room)), 0);

  // #2 + #9 deleting fails closed when the store cannot be listed
  const errLogFirst = console.error;
  const blobMod = blob as unknown as { list: (o: unknown) => Promise<unknown> };
  const realList = blobMod.list;
  const shed = await mkRoom("Shed");
  blobMod.list = async () => {
    throw new Error("store down");
  };
  console.error = () => {};
  check("#2 list failure reads as has-bookings", await D.roomHasBookings(shed.id), true);
  console.error = errLogFirst;
  const errLog = console.error;
  console.error = () => {};
  const delDown = await D.deleteRoom(admin, shed.id).then(() => "returned", () => "threw");
  console.error = errLog;
  check("#2 list failure: delete errors out, room retired NOT deleted", [delDown, (await D.getRoom(shed.id))?.active], ["threw", false]);
  blobMod.list = realList;

  // #2 a booking that lands between the check and the delete brings the room back
  const barn = await mkRoom("Barn");
  let calls = 0;
  blobMod.list = async (o: unknown) => {
    const res = (await realList(o)) as { blobs: unknown[] };
    const prefix = (o as { prefix?: string }).prefix || "";
    if (prefix.includes(`rooms/bookings/${barn.id}`) && ++calls === 2) {
      // A real booking lands in between (a create that read the room as active).
      const sneak = { ...(raced[0] as Booking), id: "barn-sneak", roomId: barn.id, date: "2027-12-06" };
      await writeJson(`rooms/bookings/${barn.id}/2027-12.json`, [sneak]);
      return (await realList(o)) as { blobs: unknown[] };
    }
    return res;
  };
  const delRace = await D.deleteRoom(admin, barn.id);
  blobMod.list = realList;
  check("#2 race: room restored as retired", [delRace.ok && delRace.value.retired, (await D.getRoom(barn.id))?.active], [true, false]);

  // #5 sign-in return path
  check("#5 relative path kept", safeNextPath("/bookings/request/abc?action=approve"), "/bookings/request/abc?action=approve");
  check("#5 other origins refused", ["//evil.test/x", "/\\evil.test", "https://evil.test", "evil", "/login?next=/x", "/x\n"].map(safeNextPath), [null, null, null, null, null, null]);
  check("#5 login url carries next", loginUrlFor("/bookings/request/abc?action=decline"), "/login?next=%2Fbookings%2Frequest%2Fabc%3Faction%3Ddecline");

  // #10 a dedicated limit for booking writes
  check("#10 bookingWriteUser limit", [LIMITS.bookingWriteUser.scope, LIMITS.bookingWriteUser.max], ["booking-write-user", 120]);

  // ======================= second review =======================
  const { hasEnded } = await import("../lib/roomBookings");
  const yard = await mkRoom("Yard");
  const putHook = blob as unknown as { put: (...a: unknown[]) => Promise<unknown> };
  const realPut = putHook.put;
  const quiet = async <T,>(f: () => Promise<T>) => {
    const e = console.error;
    console.error = () => {};
    try {
      return await f();
    } finally {
      console.error = e;
    }
  };

  // R1 cancel series only cancels the occurrences the caller holds
  const ser = await D.createBooking(alice, inp(yard.id, "2027-05-03", 600, 660, { recurrence: weekly(3) })); // May 3, 10, 17
  if (!ser.ok) throw new Error("create failed");
  const [y1, y2, y3] = ser.value.bookings;
  await D.updateBooking(alice, y2.id, y2.date, inp(yard.id, y2.date, 600, 660, { bookedForId: "cara" }));
  const caraCancel = await D.cancelBooking(cara, yard.id, y2.date, y2.id, "series");
  check("R1 holder of one occurrence cancels only that one", caraCancel.ok && [caraCancel.value.count, caraCancel.value.skipped], [1, 1]);
  check("R1 the occurrence she doesn't hold is still booked", (await D.findBooking(yard.id, y3.date, y3.id))?.status, "confirmed");
  check("R1 earlier occurrence untouched", (await D.findBooking(yard.id, y1.date, y1.id))?.status, "confirmed");

  // R2 a cancel racing a hand-over: the holder is re-checked on the record being written
  const yardKey = [...store.keys()].find((k) => k.endsWith(`rooms/bookings/${yard.id}/2027-05.json`))!;
  let yardReads = 0;
  const getBefore = store.get.bind(store);
  store.get = (k: string) => {
    if (k === yardKey && ++yardReads === 2) {
      const f = getBefore(k)!;
      const list = JSON.parse(f.bytes.toString()) as Booking[];
      const changed = list.map((b) => (b.id === y3.id ? { ...b, bookedById: "bob", bookedByName: "bob Tester", updatedAt: "x" } : b));
      store.set(k, { ...f, bytes: Buffer.from(JSON.stringify(changed)), etag: '"handed"' });
    }
    return getBefore(k);
  };
  const raceCancel = await D.cancelBooking(alice, yard.id, y3.date, y3.id, "one");
  store.get = getBefore;
  check("R2 cancel after it changed hands is refused", status(raceCancel), 403);
  check("R2 the new holder's booking survives", [(await D.findBooking(yard.id, y3.date, y3.id))?.status, (await D.findBooking(yard.id, y3.date, y3.id))?.bookedById], ["confirmed", "bob"]);

  // R3 a storage failure while writing a series undoes the months already written
  putHook.put = async (...a: unknown[]) => {
    if (String(a[0]).endsWith(`rooms/bookings/${yard.id}/2027-07.json`)) throw new Error("store down");
    return realPut(...a);
  };
  const halfSeries = await quiet(() => D.createBooking(alice, inp(yard.id, "2027-06-28", 900, 960, { recurrence: weekly(2), title: "Half" })).then(() => "returned", () => "threw")); // Jun 28, Jul 5
  putHook.put = realPut;
  check("R3 series write failure throws", halfSeries, "threw");
  check("R3 the June half was undone", (await readJson<Booking[]>(`rooms/bookings/${yard.id}/2027-06.json`, [])).filter((b) => b.title === "Half").length, 0);

  // R4 a failed cross-month move leaves the booking in ONE month
  const mover = await D.createBooking(alice, inp(yard.id, "2027-08-02", 600, 660, { title: "Mover" }));
  if (!mover.ok) throw new Error("create failed");
  const mo = mover.value.bookings[0];
  let augPuts = 0;
  putHook.put = async (...a: unknown[]) => {
    if (String(a[0]).endsWith(`rooms/bookings/${yard.id}/2027-08.json`) && ++augPuts === 1) throw new Error("store down");
    return realPut(...a);
  };
  const halfMove = await quiet(() => D.updateBooking(alice, mo.id, mo.date, inp(yard.id, "2027-09-06", 600, 660, { title: "Mover" })).then(() => "returned", () => "threw"));
  putHook.put = realPut;
  check("R4 move failure throws", halfMove, "threw");
  check("R4 no copy left in the new month", (await D.findBooking(yard.id, "2027-09-06", mo.id)) === null, true);
  check("R4 still in the old month", (await D.findBooking(yard.id, "2027-08-02", mo.id))?.status, "confirmed");

  // R5 no asking for, or approving, a meeting that has started
  const soon = await D.createBooking(alice, inp(yard.id, "2027-10-20", 600, 720, { title: "Soon" }));
  if (!soon.ok) throw new Error("create failed");
  const sb = soon.value.bookings[0];
  const during = new Date("2027-10-20T08:30:00Z"); // 10:30 SAST, under way
  check("R5 asking for a started meeting refused", status(await D.requestRoom(bob, yard.id, sb.date, sb.id, { title: "x", message: "y", attendeeCount: 1 }, during)), 400);
  const early = await D.requestRoom(bob, yard.id, sb.date, sb.id, { title: "Bob's", message: "Please", attendeeCount: 1 });
  if (!early.ok) throw new Error("request failed");
  check("R5 approving once it has started refused", status(await D.respondToRequest(alice, early.value.request.token, "approve", "", during)), 409);
  const lapsed = await D.findBooking(yard.id, sb.date, sb.id);
  check("R5 the request lapsed, the booking stayed", [lapsed?.requests[0].status, lapsed?.bookedById], ["withdrawn", "alice"]);

  // R6 ended bookings are the record
  const after = new Date("2027-10-20T11:00:00Z"); // 13:00 SAST, ended at 12:00
  check("R6 hasEnded", [hasEnded("2027-10-20", 720, after), hasEnded("2027-10-20", 840, after)], [true, false]);
  check("R6 editing an ended booking refused", status(await D.updateBooking(alice, sb.id, sb.date, inp(yard.id, sb.date, 600, 720, { title: "Rewritten" }), after)), 400);
  check("R6 cancelling an ended booking refused, even for manage_rooms", status(await D.cancelBooking(admin, yard.id, sb.date, sb.id, "one", after)), 400);
  check("R6 calendar offers no edit on an ended booking", D.bookingView({ ...sb, date: "2020-01-01" }, admin).canEdit, false);

  // R9 one display-name rule
  check("R9 displayName", [D.displayName({ name: "Jane", surname: "Doe", email: "j@x" }), D.displayName({ name: " ", surname: "", email: "j@x" })], ["Jane Doe", "j@x"]);

  // R7 + R8 through the real routes
  process.env.AUTH_SECRET ||= "room-bookings-test-secret";
  const { NextRequest } = await import("next/server");
  const { DEFAULT_ROLES } = await import("../lib/roles");
  const { saveRoles } = await import("../lib/rolesData");
  const { createSessionToken, SESSION_COOKIE } = await import("../lib/session");
  const { tenantScope } = await import("../lib/tenantContext");
  const { key: tenantKey } = await tenantScope();
  await saveRoles(DEFAULT_ROLES);
  const erin = await createUser({ id: "erin", name: "Erin", surname: "Member", email: "erin@example.test", password: "pw-erin", role: "sgb-member", forcePasswordChange: false, tagIds: [] });
  const sam = await createUser({ id: "sam", name: "Sam", surname: "Super", email: "sam@example.test", password: "pw-sam", role: "super-admin", forcePasswordChange: false, tagIds: [] });
  const get = (as: { id: string; password: string }, path: string) =>
    new NextRequest(`http://school.test${path}`, { headers: { cookie: `${SESSION_COOKIE}=${createSessionToken(as, tenantKey)}`, host: "school.test" } });
  const peopleRoute = await import("../app/api/bookings/people/route");
  const asMember = (await (await peopleRoute.GET(get(erin, "/api/bookings/people"))).json()) as { email?: string }[];
  const asSuper = (await (await peopleRoute.GET(get(sam, "/api/bookings/people"))).json()) as { email?: string }[];
  check("R7 booker sees names, no emails", [asMember.length > 0, asMember.some((p) => "email" in p)], [true, false]);
  check("R7 user-list viewer still sees emails", asSuper.every((p) => typeof p.email === "string"), true);

  const erinBooking = await D.createBooking(D.actorOf({ id: "erin", name: "Erin", surname: "Member", email: "erin@example.test", role: "sgb-member", roleName: "", permissions: ["book_rooms"] }), inp(yard.id, "2027-11-15", 600, 660));
  if (!erinBooking.ok) throw new Error("create failed");
  const eb = erinBooking.value.bookings[0];
  const samAsk = await D.requestRoom(D.actorOf({ id: "sam", name: "Sam", surname: "Super", email: "sam@example.test", role: "super-admin", roleName: "", permissions: ["book_rooms", "manage_rooms"] }), yard.id, eb.date, eb.id, { title: "Sam's", message: "Please", attendeeCount: 1 });
  if (!samAsk.ok) throw new Error("request failed");
  const reqRoute = await import("../app/api/bookings/request/[token]/route");
  const roleOf = async (as: { id: string; password: string }) =>
    ((await (await reqRoute.GET(get(as, `/api/bookings/request/${samAsk.value.request.token}`), { params: Promise.resolve({ token: samAsk.value.request.token }) })).json()) as { viewerRole: string; holderName: string });
  const holderView = await roleOf(erin);
  check("R8 holder gets holder wording", holderView.viewerRole, "holder");
  check("R8 requester gets requester wording", (await roleOf(sam)).viewerRole, "requester");
  check("R9 holder label comes from holderLabel()", holderView.holderName, "Erin Member");
  const mia = await createUser({ id: "mia", name: "Mia", surname: "Admin", email: "mia@example.test", password: "pw-mia", role: "sgb-admin", forcePasswordChange: false, tagIds: [] });
  check("R8 a room manager gets neutral wording", (await roleOf(mia)).viewerRole, "manager");

  // ======================= third review =======================
  const { notifyWithdrawn, notifyCancelledByOther, notifyRequestOutcome } = await import("../lib/roomBookingNotify");
  const { endMinuteFromLabel } = await import("../lib/roomBookings");
  const { passwordChangeUrl } = await import("../lib/nextPath");
  const { cappedList } = await import("../lib/email");
  const actorFromUser = (u: { id: string; name: string; surname: string; email: string }, permissions: string[]) =>
    D.actorOf({ ...u, role: "", roleName: "", permissions });
  const samA = actorFromUser({ id: "sam", name: "Sam", surname: "Super", email: "sam@example.test" }, ["book_rooms", "manage_rooms"]);
  const erinA = actorFromUser({ id: "erin", name: "Erin", surname: "Member", email: "erin@example.test" }, ["book_rooms"]);
  const miaA = actorFromUser({ id: "mia", name: "Mia", surname: "Admin", email: "mia@example.test" }, ["book_rooms", "manage_rooms"]);
  const tok = samAsk.value.request.token;

  // T7 a manager who asked cannot approve their own request; another manager can, and the holder is told
  check("T7 requesting manager cannot answer", (await D.getRequestView(samA, tok)).ok && ((await D.getRequestView(samA, tok)) as { value: { canAnswer: boolean } }).value.canAnswer, false);
  check("T7 requesting manager approve refused", status(await D.respondToRequest(samA, tok, "approve", "")), 403);
  const onBehalf = await D.respondToRequest(miaA, tok, "approve", "");
  check("T7 another manager can approve", onBehalf.ok && onBehalf.value.onBehalf, true);
  if (!onBehalf.ok) throw new Error("approve failed");
  outbox.length = 0;
  await notifyRequestOutcome(onBehalf.value.before, onBehalf.value.after, onBehalf.value.room, onBehalf.value.request, { name: miaA.name, email: miaA.email, onBehalf: true });
  check("T7 the holder is emailed that it was given away", mailTo("erin@example.test", "was given to"), 1);

  // T1 after the hand-over: roles and access come from who held it when asked
  check("T1 request records who held it", samAsk.value.request.holderIds, ["erin"]);
  check("T1 old holder can still open it, as holder", (await roleOf(erin)).viewerRole, "holder");
  check("T1 requester (now holding it) still reads as requester", (await roleOf(sam)).viewerRole, "requester");
  check("T1 holder name is the original holder", (await roleOf(sam)).holderName, "Erin Member");

  // T2 every withdrawal emails the requester; a manager's cancel emails both holders
  const t2 = await D.createBooking(erinA, inp(yard.id, "2027-11-22", 600, 660, { bookedForId: "cara" }));
  if (!t2.ok) throw new Error("create failed");
  const t2b = t2.value.bookings[0];
  await D.requestRoom(bob, yard.id, t2b.date, t2b.id, { title: "Bob's", message: "Please", attendeeCount: 1 });
  const mCancel = await D.cancelBooking(miaA, yard.id, t2b.date, t2b.id, "one");
  if (!mCancel.ok) throw new Error("cancel failed");
  check("T2 cancel reports the withdrawn request", mCancel.value.withdrawn.map((w) => [w.request.requesterId, w.reason]), [["bob", "cancelled"]]);
  outbox.length = 0;
  await notifyWithdrawn(mCancel.value.withdrawn, yard);
  await notifyCancelledByOther(mCancel.value.cancelled, yard, miaA);
  check("T2 requester emailed on cancel", mailTo("bob@example.test", "has lapsed"), 1);
  check("T2 manager cancel emails the booker AND the person it was for", [mailTo("erin@example.test", "Cancelled by"), mailTo("cara@example.test", "Cancelled by")], [1, 1]);

  const t2m = await D.createBooking(erinA, inp(yard.id, "2027-11-23", 600, 660));
  if (!t2m.ok) throw new Error("create failed");
  const t2mb = t2m.value.bookings[0];
  await D.requestRoom(bob, yard.id, t2mb.date, t2mb.id, { title: "Bob's", message: "Please", attendeeCount: 1 });
  const moveIt = await D.updateBooking(erinA, t2mb.id, t2mb.date, inp(yard.id, "2027-11-23", 720, 780));
  check("T2 a move reports the withdrawn request", moveIt.ok && moveIt.value.withdrawn.map((w) => w.reason), ["moved"]);
  const t2a = await D.createBooking(erinA, inp(yard.id, "2027-11-24", 600, 660));
  if (!t2a.ok) throw new Error("create failed");
  const t2ab = t2a.value.bookings[0];
  const qa = await D.requestRoom(bob, yard.id, t2ab.date, t2ab.id, { title: "Bob's", message: "Please", attendeeCount: 1 });
  await D.requestRoom(cara, yard.id, t2ab.date, t2ab.id, { title: "Cara's", message: "Me", attendeeCount: 1 });
  if (!qa.ok) throw new Error("request failed");
  const appr = await D.respondToRequest(erinA, qa.value.request.token, "approve", "");
  check("T2 approving reports the other request as given away", appr.ok && appr.value.withdrawn.map((w) => [w.request.requesterId, w.reason]), [["cara", "given_away"]]);
  const t2l = await D.createBooking(erinA, inp(yard.id, "2027-11-25", 600, 660));
  if (!t2l.ok) throw new Error("create failed");
  const t2lb = t2l.value.bookings[0];
  const ql = await D.requestRoom(bob, yard.id, t2lb.date, t2lb.id, { title: "Bob's", message: "Please", attendeeCount: 1 });
  if (!ql.ok) throw new Error("request failed");
  const late = await D.respondToRequest(erinA, ql.value.request.token, "approve", "", new Date("2027-11-25T09:00:00Z"));
  check("T2 a lapsed approve reports the lapsed request", !late.ok && late.withdrawn?.map((w) => [w.request.requesterId, w.reason]), [["bob", "lapsed"]]);

  // T3 retiring emails ONE message per holder, not one per booking
  const quad = await mkRoom("Quad");
  await D.createBooking(erinA, inp(quad.id, "2027-12-01", 600, 660));
  await D.createBooking(erinA, inp(quad.id, "2027-12-02", 600, 660));
  await D.createBooking(erinA, inp(quad.id, "2027-12-03", 600, 660, { bookedForId: "cara" }));
  const qret = await D.saveRoom(admin, quad.id, { name: "Quad", capacity: 10, color: "#0d9488", notes: "", active: false });
  if (!qret.ok) throw new Error("retire failed");
  outbox.length = 0;
  const qFailed = await notifyRoomRetired(qret.value.cancelled, qret.value.room);
  check("T3 three bookings, one email each to Erin and Cara", [qret.value.cancelled.length, mailTo("erin@example.test", "no longer available"), mailTo("cara@example.test", "no longer available"), outbox.length, qFailed], [3, 1, 1, 2, 0]);
  check("T3 the list is capped", [cappedList(Array.from({ length: 25 }, (_, i) => String(i))).shown.length, cappedList(Array.from({ length: 25 }, (_, i) => String(i))).more], [20, 5]);

  // T5 an end of 00:00 is midnight, so 00:00 to 24:00 can be booked
  check("T5 end 00:00 reads as 24:00", [endMinuteFromLabel("00:00", 0), endMinuteFromLabel("00:00", 600), endMinuteFromLabel("10:00", 0)], [1440, 1440, 600]);
  check("T5 a whole-day 00:00-24:00 booking is accepted", status(await D.createBooking(erinA, inp(yard.id, "2027-12-28", 0, endMinuteFromLabel("00:00", 0)!), new Date("2027-12-01T00:00:00Z"))), "ok");

  // T6 the forced password change keeps the emailed link
  check("T6 password change keeps a safe next", [passwordChangeUrl("/bookings/request/abc?action=approve"), passwordChangeUrl("//evil.test"), passwordChangeUrl(null)], [
    "/account?changePassword=1&next=%2Fbookings%2Frequest%2Fabc%3Faction%3Dapprove",
    "/account?changePassword=1",
    "/account?changePassword=1",
  ]);

  // ======================= fourth review =======================
  const { normaliseRecurrence } = await import("../lib/roomBookings");
  const { readFileSync } = await import("node:fs");
  const { runRoomBookingReminders: runRem } = await import("../lib/roomBookingNotify");
  const caraA = actorFromUser({ id: "cara", name: "Cara", surname: "Tester", email: "cara@example.test" }, ["book_rooms"]);
  const ring = await mkRoom("Ring");

  // F1 "Never" with leftover end-on-date fields still saves
  const stale = { frequency: "none", interval: 1, weekdays: [], endMode: "date", count: 10, until: "" };
  check("F1 server ignores end fields when it does not repeat", D.parseBookingInput({ roomId: ring.id, title: "x", date: "2027-12-06", startMinute: 600, endMinute: 660, attendeeCount: 1, recurrence: stale }).ok, true);
  check("F1 client normalises Never", normaliseRecurrence(stale as import("../lib/roomBookings").Recurrence), { frequency: "none", interval: 1, weekdays: [], endMode: "count", count: 1, until: "" });

  // F2 every holder other than the actor is told
  const forSarah = await D.createBooking(erinA, inp(ring.id, "2027-12-07", 600, 660, { bookedForId: "cara" }));
  if (!forSarah.ok) throw new Error("create failed");
  const fs1 = forSarah.value.bookings[0];
  const selfCancel = await D.cancelBooking(erinA, ring.id, fs1.date, fs1.id, "one");
  if (!selfCancel.ok) throw new Error("cancel failed");
  outbox.length = 0;
  await notifyCancelledByOther(selfCancel.value.cancelled, ring, erinA);
  check("F2 Jane cancels what she booked for Sarah: Sarah told, Jane not", [mailTo("cara@example.test", "Cancelled by"), mailTo("erin@example.test", "Cancelled by")], [1, 0]);
  const forSarah2 = await D.createBooking(erinA, inp(ring.id, "2027-12-08", 600, 660, { bookedForId: "cara" }));
  if (!forSarah2.ok) throw new Error("create failed");
  const fs2 = forSarah2.value.bookings[0];
  const ask2 = await D.requestRoom(bob, ring.id, fs2.date, fs2.id, { title: "Bob's", message: "Please", attendeeCount: 1 });
  if (!ask2.ok) throw new Error("request failed");
  const sarahYes = await D.respondToRequest(caraA, ask2.value.request.token, "approve", "");
  if (!sarahYes.ok) throw new Error("approve failed");
  outbox.length = 0;
  await notifyRequestOutcome(sarahYes.value.before, sarahYes.value.after, sarahYes.value.room, sarahYes.value.request, { name: caraA.name, email: caraA.email, onBehalf: sarahYes.value.onBehalf });
  check("F2 Sarah approves: Jane (the booker) told, Sarah not", [mailTo("erin@example.test", "was given to"), mailTo("cara@example.test", "was given to")], [1, 0]);

  // F3 one pending request per person per series
  const rs = await D.createBooking(erinA, inp(ring.id, "2027-12-13", 600, 660, { recurrence: weekly(3) }));
  if (!rs.ok) throw new Error("create failed");
  const [rs1, rs2] = rs.value.bookings;
  check("F3 first ask in a series", status(await D.requestRoom(bob, ring.id, rs1.date, rs1.id, { title: "x", message: "y", attendeeCount: 1 })), "ok");
  check("F3 second ask in the same series refused", status(await D.requestRoom(bob, ring.id, rs2.date, rs2.id, { title: "x", message: "y", attendeeCount: 1 })), 409);
  check("F3 request route also applies the email limit", readFileSync("app/api/bookings/[id]/request/route.ts", "utf8").includes("LIMITS.emailSendUser"), true);

  // F4 retiring cancels only meetings that have not started
  const dome = await mkRoom("Dome");
  const morning = new Date("2027-12-10T04:00:00Z"); // 06:00 SAST
  const ended = await D.createBooking(erinA, inp(dome.id, "2027-12-10", 420, 480), morning); // 07:00-08:00
  const under = await D.createBooking(erinA, inp(dome.id, "2027-12-10", 540, 660), morning); // 09:00-11:00
  const laterToday = await D.createBooking(erinA, inp(dome.id, "2027-12-10", 900, 960), morning); // 15:00-16:00
  if (!ended.ok || !under.ok || !laterToday.ok) throw new Error("create failed");
  const at10 = new Date("2027-12-10T08:00:00Z"); // 10:00 SAST
  const gone = await D.cancelRoomFutureBookings(dome.id, "Admin", at10);
  check("F4 only the meeting not yet started is cancelled", gone.map((b) => b.id), [laterToday.value.bookings[0].id]);

  // F5 + F8 reminders per holder: a holder already reached is not sent it again
  const rem2 = await D.createBooking(erinA, inp(ring.id, "2027-12-21", 600, 660, { bookedForId: "cara" }));
  if (!rem2.ok) throw new Error("create failed");
  const r2b = rem2.value.bookings[0];
  const eve = new Date("2027-12-21T05:00:00Z"); // the 07:00 run on the day
  const stamp2 = eve.toISOString();
  await D.claimReminder(r2b, stamp2, null);
  await D.finishReminder(r2b, stamp2, ["erin@example.test"], false); // as if Cara's send had failed
  check("F5 half-reminded booking is due again", (await D.bookingsDueForReminder(eve)).some((x) => x.booking.id === r2b.id), true);
  outbox.length = 0;
  await runRem(eve);
  check("F5 retry reaches only the holder who missed it", [mailTo("cara@example.test", "Today"), mailTo("erin@example.test", "Today")], [1, 0]);
  check("F5 then it is done", (await D.findBooking(ring.id, r2b.date, r2b.id))?.remindedEmails?.sort(), ["cara@example.test", "erin@example.test"]);

  // F6 a booking written while the room is deleted is taken back out
  const ringKey = `rooms/bookings/${ring.id}/2028-01.json`;
  const dropRoom = async () => {
    const rs = await readJson<import("../lib/roomBookingData").Room[]>("rooms/rooms.json", []);
    await writeJson("rooms/rooms.json", rs.filter((r) => r.id !== ring.id));
  };
  let dropped = false;
  putHook.put = async (...a: unknown[]) => {
    const res = await realPut(...a);
    if (!dropped && String(a[0]).endsWith(ringKey)) {
      dropped = true;
      await dropRoom();
    }
    return res;
  };
  const racing = await D.createBooking(erinA, inp(ring.id, "2028-01-10", 600, 660, { title: "Racer" }));
  putHook.put = realPut;
  check("F6 create racing a delete is refused", status(racing), 409);
  check("F6 and its write is rolled back", (await readJson<Booking[]>(ringKey, [])).filter((b) => b.title === "Racer").length, 0);
  // and an edit racing a retire is put back as it was
  const plaza = await mkRoom("Plaza");
  const pe = await D.createBooking(erinA, inp(plaza.id, "2028-02-07", 600, 660, { title: "Before" }));
  if (!pe.ok) throw new Error("create failed");
  const peb = pe.value.bookings[0];
  const plazaKey = `rooms/bookings/${plaza.id}/2028-02.json`;
  let retired = false;
  putHook.put = async (...a: unknown[]) => {
    const res = await realPut(...a);
    if (!retired && String(a[0]).endsWith(plazaKey)) {
      retired = true;
      const rs = await readJson<import("../lib/roomBookingData").Room[]>("rooms/rooms.json", []);
      await writeJson("rooms/rooms.json", rs.map((r) => (r.id === plaza.id ? { ...r, active: false } : r)));
    }
    return res;
  };
  const racingEdit = await D.updateBooking(erinA, peb.id, peb.date, inp(plaza.id, peb.date, 600, 720, { title: "After" }));
  putHook.put = realPut;
  check("F6 edit racing a retire is refused and undone", [status(racingEdit), (await D.findBooking(plaza.id, peb.date, peb.id))?.title], [400, "Before"]);

  // F9 only the booker (or a room manager) changes who it is for
  const f9 = await D.createBooking(erinA, inp(yard.id, "2028-03-06", 600, 660, { bookedForId: "cara" }));
  if (!f9.ok) throw new Error("create failed");
  const f9b = f9.value.bookings[0];
  check("F9 the bookee cannot re-assign it", status(await D.updateBooking(caraA, f9b.id, f9b.date, inp(yard.id, f9b.date, 600, 660, { bookedForId: "bob" }))), 403);
  check("F9 the bookee can still rename it", status(await D.updateBooking(caraA, f9b.id, f9b.date, inp(yard.id, f9b.date, 600, 660, { bookedForId: "cara", title: "Renamed" }))), "ok");
  const f9now = (await D.findBooking(yard.id, f9b.date, f9b.id))!;
  check("F9 picker shown to the booker only", [D.bookingView(f9now, erinA).canChangeHolder, D.bookingView(f9now, caraA).canChangeHolder, D.bookingView(f9now, miaA).canChangeHolder], [true, false, true]);

  // ======================= fifth review =======================
  const { giverName } = await import("../lib/roomBookingNotify");
  type RoomT = import("../lib/roomBookingData").Room;

  // V1 a cross-month edit racing a retire that cancelled the new copy: nothing is resurrected
  const arena = await mkRoom("Arena");
  const av = await D.createBooking(erinA, inp(arena.id, "2028-04-03", 600, 660, { title: "Old" }));
  if (!av.ok) throw new Error("create failed");
  const avb = av.value.bookings[0];
  const mayKey = `rooms/bookings/${arena.id}/2028-05.json`;
  let hit5 = false;
  putHook.put = async (...a: unknown[]) => {
    const res = await realPut(...a);
    if (!hit5 && String(a[0]).endsWith(mayKey)) {
      hit5 = true;
      const rs = await readJson<RoomT[]>("rooms/rooms.json", []);
      await writeJson("rooms/rooms.json", rs.map((r) => (r.id === arena.id ? { ...r, active: false } : r)));
      const may = await readJson<Booking[]>(`rooms/bookings/${arena.id}/2028-05.json`, []);
      await writeJson(`rooms/bookings/${arena.id}/2028-05.json`, may.map((b) => ({ ...b, status: "cancelled", updatedAt: "retired" })));
    }
    return res;
  };
  const v1 = await D.updateBooking(erinA, avb.id, avb.date, inp(arena.id, "2028-05-08", 600, 660, { title: "New" }));
  putHook.put = realPut;
  check("V1 refused", status(v1), 400);
  check("V1 old row NOT brought back as confirmed", (await D.findBooking(arena.id, "2028-04-03", avb.id)) === null, true);
  check("V1 the cancelled new copy stays cancelled", (await D.findBooking(arena.id, "2028-05-08", avb.id))?.status, "cancelled");

  // V2 approving resets who was reminded; no reminder on the meeting day itself
  const v2 = await D.createBooking(erinA, inp(yard.id, "2028-06-06", 600, 660));
  if (!v2.ok) throw new Error("create failed");
  const v2b = v2.value.bookings[0];
  const v2eve = new Date("2028-06-05T05:00:00Z");
  await D.claimReminder(v2b, v2eve.toISOString(), null);
  await D.finishReminder(v2b, v2eve.toISOString(), ["erin@example.test"], true);
  const v2ask = await D.requestRoom(bob, yard.id, v2b.date, v2b.id, { title: "Bob's", message: "Please", attendeeCount: 1 }, new Date("2028-06-01T00:00:00Z"));
  if (!v2ask.ok) throw new Error("request failed");
  await D.respondToRequest(erinA, v2ask.value.request.token, "approve", "", new Date("2028-06-01T00:00:00Z"));
  const v2after = await D.findBooking(yard.id, v2b.date, v2b.id);
  check("V2 approve resets the reminder record", [v2after?.reminderSentAt, v2after?.remindedEmails], [null, []]);
  // (Since review 6: a holder change means the new holder is reminded on the day, with "today" wording.)
  check("V2 the new holder is reminded on the day itself", (await D.bookingsDueForReminder(new Date("2028-06-06T05:00:00Z"))).some((x) => x.booking.id === v2b.id), true);

  // V3 the requester is re-checked when approving
  await createUser({ id: "gone", name: "Gone", surname: "Viewer", email: "gone@example.test", password: "pw", role: "viewer", forcePasswordChange: false, tagIds: [] });
  const goneA = actorFromUser({ id: "gone", name: "Gone", surname: "Viewer", email: "gone@example.test" }, ["book_rooms"]); // could book when asking
  const v3 = await D.createBooking(erinA, inp(yard.id, "2028-07-10", 600, 660));
  if (!v3.ok) throw new Error("create failed");
  const v3b = v3.value.bookings[0];
  const v3ask = await D.requestRoom(goneA, yard.id, v3b.date, v3b.id, { title: "x", message: "y", attendeeCount: 1 });
  if (!v3ask.ok) throw new Error("request failed");
  const v3res = await D.respondToRequest(erinA, v3ask.value.request.token, "approve", "");
  check("V3 requester who can no longer book: refused, request withdrawn with a reason", [status(v3res), !v3res.ok && v3res.withdrawn?.map((w) => w.reason)], [409, ["requester_unable"]]);
  check("V3 booking stays with the holder", (await D.findBooking(yard.id, v3b.date, v3b.id))?.bookedById, "erin");
  const tiny = await mkRoom("Tiny");
  const v3c = await D.createBooking(erinA, inp(tiny.id, "2028-07-11", 600, 660));
  if (!v3c.ok) throw new Error("create failed");
  const v3cb = v3c.value.bookings[0];
  const big = await D.requestRoom(bob, tiny.id, v3cb.date, v3cb.id, { title: "Big", message: "y", attendeeCount: 8 });
  if (!big.ok) throw new Error("request failed");
  await D.saveRoom(admin, tiny.id, { name: "Tiny", capacity: 4, color: "#0d9488", notes: "" });
  check("V3 headcount over the room's capacity now: refused", status(await D.respondToRequest(erinA, big.value.request.token, "approve", "")), 409);
  check("V3 and the request is left pending", (await D.findBooking(tiny.id, v3cb.date, v3cb.id))?.requests[0].status, "pending");

  // V4 the requester is told a room manager gave them the room
  check("V4 giver name", [giverName(v3b, { name: "Mia Admin", onBehalf: true }), giverName(v3b, { name: "Erin Member", onBehalf: false })], ["Mia Admin (a room manager)", "Erin Member"]);

  // V5 a late approve lapses EVERY pending request on that meeting
  const v5 = await D.createBooking(erinA, inp(yard.id, "2028-08-14", 600, 720));
  if (!v5.ok) throw new Error("create failed");
  const v5b = v5.value.bookings[0];
  const v5a = await D.requestRoom(bob, yard.id, v5b.date, v5b.id, { title: "Bob", message: "y", attendeeCount: 1 });
  await D.requestRoom(cara, yard.id, v5b.date, v5b.id, { title: "Cara", message: "y", attendeeCount: 1 });
  if (!v5a.ok) throw new Error("request failed");
  const v5late = await D.respondToRequest(erinA, v5a.value.request.token, "approve", "", new Date("2028-08-14T08:30:00Z"));
  check("V5 both pending requests lapse", !v5late.ok && v5late.withdrawn?.map((w) => w.request.requesterId).sort(), ["bob", "cara"]);

  // V6 two asks in one series at the same moment: exactly one gets through
  const v6 = await D.createBooking(erinA, inp(yard.id, "2028-09-04", 600, 660, { recurrence: weekly(2) }));
  if (!v6.ok) throw new Error("create failed");
  const [v61, v62] = v6.value.bookings;
  const [x1, x2] = await Promise.all([
    D.requestRoom(bob, yard.id, v61.date, v61.id, { title: "a", message: "y", attendeeCount: 1 }),
    D.requestRoom(bob, yard.id, v62.date, v62.id, { title: "b", message: "y", attendeeCount: 1 }),
  ]);
  check("V6 racing asks in one series: exactly one", [x1.ok, x2.ok].filter(Boolean).length, 1);
  const won = x1.ok ? x1 : x2;
  if (!won.ok) throw new Error("no winner");
  await D.respondToRequest(erinA, won.value.request.token, "decline", "Busy");
  check("V6 once answered, a new ask in the series is allowed", status(await D.requestRoom(bob, yard.id, v62.date, v62.id, { title: "c", message: "y", attendeeCount: 1 })), "ok");

  // V7 an edit that emails counts against the email limit
  check("V7 edit route applies the email limit", readFileSync("app/api/bookings/[id]/route.ts", "utf8").includes("LIMITS.emailSendUser"), true);

  // V8 the week view of a retired room is refused unless you manage rooms
  const weekRoute = await import("../app/api/bookings/route");
  check("V8 retired room week: 404 for a booker", (await weekRoute.GET(get(erin, `/api/bookings?room=${lab.id}&week=2027-12-13`))).status, 404);
  check("V8 retired room week: open to a room manager", (await weekRoute.GET(get(mia, `/api/bookings?room=${lab.id}&week=2027-12-13`))).status, 200);

  // ======================= sixth review =======================
  const S6 = await mkRoom("Studio");
  const injectOnSecondRead = (key: string, change: (b: Booking) => Booking, bookingId: string) => {
    let reads = 0;
    const orig = store.get.bind(store);
    store.get = (k: string) => {
      if (k.endsWith(key) && ++reads === 2) {
        const f = orig(k)!;
        const list = JSON.parse(f.bytes.toString()) as Booking[];
        store.set(k, { ...f, bytes: Buffer.from(JSON.stringify(list.map((b) => (b.id === bookingId ? change(b) : b)))), etag: '"injected"' });
      }
      return orig(k);
    };
    return () => (store.get = orig);
  };

  // W1 every writer bumps updatedAt
  const w1 = await D.createBooking(erinA, inp(S6.id, "2028-10-02", 600, 660));
  if (!w1.ok) throw new Error("create failed");
  const w1b = w1.value.bookings[0];
  await D.requestRoom(bob, S6.id, w1b.date, w1b.id, { title: "Bob", message: "y", attendeeCount: 1 });
  const afterAsk = (await D.findBooking(S6.id, w1b.date, w1b.id))!;
  await D.claimReminder(afterAsk, "2028-10-01T05:00:00.000Z", null);
  const afterClaim = (await D.findBooking(S6.id, w1b.date, w1b.id))!;
  check("W1 asking and claiming a reminder both move updatedAt", [afterAsk.updatedAt !== w1b.updatedAt, afterClaim.updatedAt !== afterAsk.updatedAt], [true, true]);

  // W1 an edit that overlaps a new request keeps the request
  const w2 = await D.createBooking(erinA, inp(S6.id, "2028-10-03", 600, 660, { title: "Edit me" }));
  if (!w2.ok) throw new Error("create failed");
  const w2b = w2.value.bookings[0];
  const lateAsk = { token: "late-ask", requesterId: "bob", requesterName: "bob Tester", requesterEmail: "bob@example.test", title: "Bob", message: "y", attendeeCount: 1, status: "pending", createdAt: "x", holderIds: ["erin"] };
  let restore = injectOnSecondRead("2028-10.json", (b) => ({ ...b, requests: [...b.requests, lateAsk as Booking["requests"][number]], updatedAt: new Date(Date.parse(b.updatedAt) + 5).toISOString() }), w2b.id);
  const w2e = await D.updateBooking(erinA, w2b.id, w2b.date, inp(S6.id, w2b.date, 600, 660, { title: "Edited" }));
  restore();
  const w2now = await D.findBooking(S6.id, w2b.date, w2b.id);
  check("W1 overlapping edit saved and the new request kept", [status(w2e), w2now?.title, w2now?.requests.map((q) => q.status)], ["ok", "Edited", ["pending"]]);

  // W2 an edit that overlaps a reminder claim keeps the stamp (no duplicate reminder)
  restore = injectOnSecondRead("2028-10.json", (b) => ({ ...b, reminderSentAt: "2028-10-02T05:00:00.000Z", updatedAt: new Date(Date.parse(b.updatedAt) + 5).toISOString() }), w2b.id);
  const w3e = await D.updateBooking(erinA, w2b.id, w2b.date, inp(S6.id, w2b.date, 600, 660, { title: "Edited again" }));
  restore();
  check("W2 overlapping edit keeps the reminder stamp", [status(w3e), (await D.findBooking(S6.id, w2b.date, w2b.id))?.reminderSentAt], ["ok", "2028-10-02T05:00:00.000Z"]);

  // W3 reminders: anything starting within the window, worded from the real date
  const madeLate = await D.createBooking(erinA, inp(S6.id, "2028-11-08", 600, 660), new Date("2028-11-07T13:00:00Z")); // booked 15:00 for tomorrow 10:00
  const evening = await D.createBooking(erinA, inp(S6.id, "2028-11-08", 1200, 1260), new Date("2028-11-07T13:00:00Z")); // tomorrow 20:00
  if (!madeLate.ok || !evening.ok) throw new Error("create failed");
  const run1 = new Date("2028-11-07T05:00:00Z"); // 07:00 the day before: the 20:00 meeting is 37 h away
  check("W3 a meeting more than 31 h away is not due yet", (await D.bookingsDueForReminder(run1)).some((x) => x.booking.id === evening.value.bookings[0].id), false);
  outbox.length = 0;
  await runRem(new Date("2028-11-08T05:00:00Z")); // 07:00 on the day
  check("W3 booked after yesterday's run: reminded on the day, worded 'Today'", outbox.filter((m) => m.to === "erin@example.test" && m.subject.startsWith("Today: Studio")).length, 2);
  check("W3 and never 'Tomorrow' on the day", outbox.filter((m) => m.subject.startsWith("Tomorrow: Studio")).length, 0);

  // W4 a series marker claimed a moment ago, request not written yet, holds; a stale one is taken over
  const w4 = await D.createBooking(erinA, inp(S6.id, "2028-12-04", 600, 660, { recurrence: weekly(2) }));
  if (!w4.ok) throw new Error("create failed");
  const [w41, w42] = w4.value.bookings;
  const markerPath = `rooms/requests-by-series/${w41.seriesId}/bob.json`;
  await writeJson(markerPath, { token: "being-written", at: Date.now() });
  check("W4 fresh marker with no request yet holds", status(await D.requestRoom(bob, S6.id, w41.date, w41.id, { title: "x", message: "y", attendeeCount: 1 })), 409);
  await writeJson(markerPath, { token: "being-written", at: Date.now() - 3 * 60_000 });
  check("W4 a marker still empty after the grace period is taken over", status(await D.requestRoom(bob, S6.id, w41.date, w41.id, { title: "x", message: "y", attendeeCount: 1 })), "ok");
  check("W4 and that ask now holds the series", status(await D.requestRoom(bob, S6.id, w42.date, w42.id, { title: "x", message: "y", attendeeCount: 1 })), 409);

  // W5 a room manager declining: the requester is told a room manager declined
  const w5 = await D.createBooking(erinA, inp(S6.id, "2029-01-08", 600, 660));
  if (!w5.ok) throw new Error("create failed");
  const w5b = w5.value.bookings[0];
  const w5q = await D.requestRoom(bob, S6.id, w5b.date, w5b.id, { title: "x", message: "y", attendeeCount: 1 });
  if (!w5q.ok) throw new Error("request failed");
  const w5r = await D.respondToRequest(miaA, w5q.value.request.token, "decline", "Board needs it");
  if (!w5r.ok) throw new Error("decline failed");
  outbox.length = 0;
  await notifyRequestOutcome(w5r.value.before, w5r.value.after, w5r.value.room, w5r.value.request, { name: miaA.name, email: miaA.email, onBehalf: w5r.value.onBehalf });
  check("W5 decline email names the room manager", outbox.filter((m) => m.to === "bob@example.test" && m.subject.startsWith("Mia Admin (a room manager) declined")).length, 1);

  // W6 a booking for someone whose login was since deleted stays editable
  const { deleteUser } = await import("../lib/userData");
  await createUser({ id: "temp", name: "Temp", surname: "Person", email: "temp@example.test", password: "pw", role: "sgb-member", forcePasswordChange: false, tagIds: [] });
  const w6 = await D.createBooking(erinA, inp(S6.id, "2029-01-15", 600, 660, { bookedForId: "temp" }));
  if (!w6.ok) throw new Error("create failed");
  await deleteUser("temp");
  const w6b = w6.value.bookings[0];
  const w6e = await D.updateBooking(erinA, w6b.id, w6b.date, inp(S6.id, w6b.date, 600, 660, { bookedForId: "temp", title: "Still editable" }));
  check("W6 unchanged deleted bookee: edit still saves, name kept", [status(w6e), w6e.ok && w6e.value.after.bookedForName], ["ok", "Temp Person"]);
  check("W6 but choosing a deleted person is still refused", status(await D.updateBooking(erinA, w6b.id, w6b.date, inp(S6.id, w6b.date, 600, 660, { bookedForId: "ghost" }))), 400);

  // W7 extending a meeting under way: allowed, not a move; ending it in the past refused
  const w7 = await D.createBooking(erinA, inp(S6.id, "2029-02-05", 600, 720), new Date("2029-02-01T00:00:00Z"));
  if (!w7.ok) throw new Error("create failed");
  const w7b = w7.value.bookings[0];
  await D.requestRoom(bob, S6.id, w7b.date, w7b.id, { title: "x", message: "y", attendeeCount: 1 }, new Date("2029-02-01T00:00:00Z"));
  const w7at = new Date("2029-02-05T09:00:00Z"); // 11:00 SAST, under way
  check("W7 ending it before now refused", status(await D.updateBooking(erinA, w7b.id, w7b.date, inp(S6.id, w7b.date, 600, 630), w7at)), 400);
  const w7e = await D.updateBooking(erinA, w7b.id, w7b.date, inp(S6.id, w7b.date, 600, 780), w7at);
  check("W7 extending it is allowed and is not a move", [status(w7e), w7e.ok && w7e.value.withdrawn.length, (await D.findBooking(S6.id, w7b.date, w7b.id))?.requests[0].status], ["ok", 0, "pending"]);

  // W8 series cancel with nothing left: 409, not 403
  const w8 = await D.createBooking(erinA, inp(S6.id, "2029-03-05", 600, 660, { recurrence: weekly(2) }));
  if (!w8.ok) throw new Error("create failed");
  const [w81] = w8.value.bookings;
  restore = (() => {
    let reads = 0;
    const orig = store.get.bind(store);
    store.get = (k: string) => {
      if (k.endsWith("2029-03.json") && ++reads === 2) {
        const f = orig(k)!;
        const list = JSON.parse(f.bytes.toString()) as Booking[];
        store.set(k, { ...f, bytes: Buffer.from(JSON.stringify(list.map((b) => (b.seriesId === w81.seriesId ? { ...b, status: "cancelled" } : b)))), etag: '"gone"' });
      }
      return orig(k);
    };
    return () => (store.get = orig);
  })();
  const w8c = await D.cancelBooking(erinA, S6.id, w81.date, w81.id, "series");
  restore();
  check("W8 nothing left to cancel: 409", [status(w8c), !w8c.ok && w8c.error], [409, "Nothing left to cancel in this series"]);

  // W9 the edit says, before writing, whether it will email; refusing stops it
  const w9 = await D.createBooking(erinA, inp(S6.id, "2029-04-02", 600, 660, { title: "W9" }));
  if (!w9.ok) throw new Error("create failed");
  const w9b = w9.value.bookings[0];
  const seen: boolean[] = [];
  await D.updateBooking(erinA, w9b.id, w9b.date, inp(S6.id, w9b.date, 600, 660, { title: "W9 renamed" }), new Date(), async (w) => (seen.push(w), true));
  const w9stop = await D.updateBooking(erinA, w9b.id, w9b.date, inp(S6.id, w9b.date, 600, 660, { title: "W9 renamed", bookedForId: "cara" }), new Date(), async (w) => (seen.push(w), false));
  check("W9 willEmail false for a rename, true for a new holder", seen, [false, true]);
  check("W9 refused by the limit: nothing written", [status(w9stop), (await D.findBooking(S6.id, w9b.date, w9b.id))?.bookedForId], [429, null]);

  // ======================= seventh review =======================
  const { runRequestLapses } = await import("../lib/roomBookingNotify");
  const S7 = await mkRoom("Hall Seven");
  const early7 = new Date("2029-05-01T00:00:00Z");

  // G1 an unanswered ask on a meeting that has started no longer blocks the series, and the cron lapses it
  const g1 = await D.createBooking(erinA, inp(S7.id, "2029-05-07", 600, 660, { recurrence: weekly(2) }), early7);
  if (!g1.ok) throw new Error("create failed");
  const [g11, g12] = g1.value.bookings;
  const g1ask = await D.requestRoom(bob, S7.id, g11.date, g11.id, { title: "x", message: "y", attendeeCount: 1 }, early7);
  check("G1 first ask in the series", status(g1ask), "ok");
  const started = new Date("2029-05-07T09:00:00Z"); // 11:00 SAST, the first meeting is under way
  check("G1 once that meeting started, the series is free to ask again", status(await D.requestRoom(bob, S7.id, g12.date, g12.id, { title: "x", message: "y", attendeeCount: 1 }, started)), "ok");
  outbox.length = 0;
  const lap = await runRequestLapses(started);
  check("G1 the cron lapses the unanswered ask on the started meeting", [lap.lapsed, (await D.findBooking(S7.id, g11.date, g11.id))?.requests[0].status], [1, "withdrawn"]);
  check("G1 and emails the requester", mailTo("bob@example.test", "has lapsed"), 1);

  // G2 create and cancel say when they will email
  check("G2 create route applies the email limit when booking for someone else", readFileSync("app/api/bookings/route.ts", "utf8").includes("LIMITS.emailSendUser"), true);
  const g2 = await D.createBooking(erinA, inp(S7.id, "2029-06-04", 600, 660, { recurrence: weekly(2) }), early7);
  const g2one = await D.createBooking(erinA, inp(S7.id, "2029-06-05", 600, 660), early7);
  if (!g2.ok || !g2one.ok) throw new Error("create failed");
  const flags: boolean[] = [];
  await D.cancelBooking(erinA, S7.id, g2one.value.bookings[0].date, g2one.value.bookings[0].id, "one", early7, async (w) => (flags.push(w), true));
  const g2stop = await D.cancelBooking(erinA, S7.id, g2.value.bookings[0].date, g2.value.bookings[0].id, "series", early7, async (w) => (flags.push(w), false));
  check("G2 own single cancel: no email; series cancel: email", flags, [false, true]);
  check("G2 refused by the limit: nothing cancelled", [status(g2stop), (await D.findBooking(S7.id, g2.value.bookings[0].date, g2.value.bookings[0].id))?.status], [429, "confirmed"]);

  // G3 the person it is for must be able to book (or manage rooms)
  check("G3 booking for someone who cannot book refused", status(await D.createBooking(erinA, inp(S7.id, "2029-06-11", 600, 660, { bookedForId: "gone" }), early7)), 400);
  check("G3 booking for a room manager allowed", status(await D.createBooking(erinA, inp(S7.id, "2029-06-12", 600, 660, { bookedForId: "mia" }), early7)), "ok");

  // G4 a reminder claim that never finished goes stale and the booking is due again
  const g4 = await D.createBooking(erinA, inp(S7.id, "2029-06-19", 600, 660, { bookedForId: "cara" }), early7);
  if (!g4.ok) throw new Error("create failed");
  const g4b = g4.value.bookings[0];
  const g4run = new Date("2029-06-19T05:00:00Z");
  await D.claimReminder(g4b, new Date(g4run.getTime() - 5 * 60_000).toISOString(), null);
  check("G4 a claim 5 minutes old still holds", (await D.bookingsDueForReminder(g4run)).some((x) => x.booking.id === g4b.id), false);
  const later20 = new Date(g4run.getTime() + 15 * 60_000);
  check("G4 after 20 minutes with no finish it is stale: due again", (await D.bookingsDueForReminder(later20)).some((x) => x.booking.id === g4b.id), true);
  outbox.length = 0;
  await runRem(later20);
  check("G4 the stale one is sent, to both holders", [mailTo("erin@example.test", "Hall Seven"), mailTo("cara@example.test", "Hall Seven")], [1, 1]);

  // G5 a cross-month move carries over a request that landed on the old copy
  const g5 = await D.createBooking(erinA, inp(S7.id, "2029-07-02", 600, 660), early7);
  if (!g5.ok) throw new Error("create failed");
  const g5b = g5.value.bookings[0];
  const lateAsk5 = { token: "late-ask-5", requesterId: "bob", requesterName: "bob Tester", requesterEmail: "bob@example.test", title: "Bob", message: "y", attendeeCount: 1, status: "pending", createdAt: "x", holderIds: ["erin"] };
  const undo5 = injectOnSecondRead(`${S7.id}/2029-07.json`, (b) => ({ ...b, requests: [...b.requests, lateAsk5 as Booking["requests"][number]], updatedAt: new Date(Date.parse(b.updatedAt) + 5).toISOString() }), g5b.id);
  const g5e = await D.updateBooking(erinA, g5b.id, g5b.date, inp(S7.id, "2029-08-06", 600, 660), early7);
  undo5();
  const g5now = await D.findBooking(S7.id, "2029-08-06", g5b.id);
  check("G5 the move carries the late request over (withdrawn, the slot moved)", [status(g5e), g5now?.requests.map((q) => [q.token, q.status])], ["ok", [["late-ask-5", "withdrawn"]]]);

  // G6 an emptied month file is not "bookings on record"
  const g6room = await mkRoom("Empty Six");
  await writeJson(`rooms/bookings/${g6room.id}/2029-09.json`, []);
  check("G6 empty month file does not count", await D.roomHasBookings(g6room.id), false);
  const g6del = await D.deleteRoom(admin, g6room.id);
  check("G6 so the room really deletes", [g6del.ok && g6del.value.retired, await D.getRoom(g6room.id)], [false, null]);

  // G7 retire sends only the flag and keeps another manager's edit
  const g7 = await mkRoom("Rename Me");
  await D.saveRoom(miaA, g7.id, { name: "Renamed by Mia", capacity: 12, color: "#0d9488", notes: "" });
  const g7r = await D.saveRoom(admin, g7.id, { active: false });
  check("G7 retire with only the flag keeps the new name", g7r.ok && [g7r.value.room.name, g7r.value.room.active], ["Renamed by Mia", false]);
  check("G7 the rooms page sends only the flag", readFileSync("app/(portal)/rooms/page.tsx", "utf8").includes('"PUT", { active: !r.active }'), true);

  // ======================= eighth review =======================
  const { notifyEdited, remindNowIfBeforeNextRun } = await import("../lib/roomBookingNotify");
  const { nextReminderRunMs, remindCutoffMs } = await import("../lib/roomBookings");
  const S8 = await mkRoom("Hall Eight");
  const e8 = new Date("2029-10-01T00:00:00Z");

  // H1 an edit tells the other holder(s) what changed, never the editor
  const h1 = await D.createBooking(erinA, inp(S8.id, "2029-10-08", 600, 660, { bookedForId: "cara", title: "Plan" }), e8);
  if (!h1.ok) throw new Error("create failed");
  const h1b = h1.value.bookings[0];
  const h1e = await D.updateBooking(erinA, h1b.id, h1b.date, inp(S8.id, h1b.date, 600, 720, { bookedForId: "cara", title: "Plan B" }), e8);
  if (!h1e.ok) throw new Error("edit failed");
  outbox.length = 0;
  await notifyEdited(h1e.value.before, h1e.value.after, S8, erinA, h1e.value.holderChanged);
  check("H1 holder edit: the other holder told, the editor not", [mailTo("cara@example.test", "Booking changed"), mailTo("erin@example.test", "Booking changed")], [1, 0]);
  const h1m = await D.updateBooking(miaA, h1b.id, h1b.date, inp(S8.id, h1b.date, 600, 720, { bookedForId: "cara", title: "Plan C" }), e8);
  if (!h1m.ok) throw new Error("edit failed");
  outbox.length = 0;
  await notifyEdited(h1m.value.before, h1m.value.after, S8, miaA, false);
  check("H1 manager edit: both holders told, one email each", [mailTo("cara@example.test", "Booking changed"), mailTo("erin@example.test", "Booking changed"), mailTo("mia@example.test", "Booking changed")], [1, 1, 0]);

  // H2 reminder timing with one 07:00 run a day
  const run7 = new Date("2029-10-15T05:00:00Z"); // Mon 07:00 SAST
  check("H2 a 07:00 run's cutoff is 08:00 tomorrow", new Date(remindCutoffMs(run7)).toISOString(), "2029-10-16T06:00:00.000Z");
  check("H2 the next run after 15:00 is 07:00 tomorrow", new Date(nextReminderRunMs(new Date("2029-10-15T13:00:00Z"))).toISOString(), "2029-10-16T05:00:00.000Z");
  const h2a = await D.createBooking(erinA, inp(S8.id, "2029-10-16", 450, 480), e8); // tomorrow 07:30: before 08:00
  const h2b = await D.createBooking(erinA, inp(S8.id, "2029-10-16", 540, 600), e8); // tomorrow 09:00: tomorrow's run
  const h2c = await D.createBooking(erinA, inp(S8.id, "2029-10-15", 360, 420), e8); // today 06:00: already started
  if (!h2a.ok || !h2b.ok || !h2c.ok) throw new Error("create failed");
  const due7 = (await D.bookingsDueForReminder(run7)).map((x) => x.booking.id);
  check("H2 07:00 run: tomorrow 07:30 due, tomorrow 09:00 not yet, already-started skipped", [due7.includes(h2a.value.bookings[0].id), due7.includes(h2b.value.bookings[0].id), due7.includes(h2c.value.bookings[0].id)], [true, false, false]);
  const h2d = await D.createBooking(erinA, inp(S8.id, "2029-10-17", 390, 420), e8); // Wed 06:30
  if (!h2d.ok) throw new Error("create failed");
  outbox.length = 0;
  const bookedAt = new Date("2029-10-16T13:00:00Z"); // Tue 15:00: next run Wed 07:00, after the meeting starts
  check("H2 booked after the run for before the next run: reminded straight away", [await remindNowIfBeforeNextRun(h2d.value.bookings[0], S8, bookedAt), mailTo("erin@example.test", "Tomorrow: Hall Eight")], [true, 1]);
  check("H2 a later meeting waits for the cron", await remindNowIfBeforeNextRun(h2b.value.bookings[0], S8, bookedAt), false);

  // H3 crash-safe moves: a half-done move shows once and is settled by the cron
  const h3 = await D.createBooking(erinA, inp(S8.id, "2029-11-05", 600, 660, { title: "Half moved" }), e8);
  if (!h3.ok) throw new Error("create failed");
  const h3b = h3.value.bookings[0];
  const longAgo = Date.now() - 20 * 60_000;
  const ghost = { ...h3b, date: "2029-12-03", moving: { from: "2029-11", at: longAgo, token: "tok-ghost" } };
  await writeJson(`rooms/bookings/${S8.id}/2029-12.json`, [ghost]); // as if the request died after step 1
  await writeJson("rooms/moves-pending.json", [{ roomId: S8.id, bookingId: h3b.id, month: "2029-12", token: "tok-ghost", at: longAgo }]);
  check("H3 the half-moved copy is hidden while the old one exists", (await D.findBooking(S8.id, "2029-12-03", h3b.id)) === null, true);
  check("H3 the calendar shows it once", (await D.bookingsBetween(S8.id, "2029-11-01", "2029-12-31")).filter((b) => b.id === h3b.id).length, 1);
  const settled1 = await D.settleStaleMoves(new Date());
  check("H3 stale move with the old copy still there: rolled back", [settled1.rolledBack >= 1, (await readJson<Booking[]>(`rooms/bookings/${S8.id}/2029-12.json`, [])).length], [true, 0]);
  const orphan = { ...h3b, id: "orphan-move", date: "2029-12-10", moving: { from: "2029-11", at: longAgo, token: "tok-orphan" } };
  await writeJson(`rooms/bookings/${S8.id}/2029-12.json`, [orphan]); // as if it died after step 2
  await writeJson("rooms/moves-pending.json", [{ roomId: S8.id, bookingId: "orphan-move", month: "2029-12", token: "tok-orphan", at: longAgo }]);
  await D.settleStaleMoves(new Date());
  check("H3 stale move with the old copy gone: finished, flag cleared", (await D.findBooking(S8.id, "2029-12-10", "orphan-move"))?.moving, undefined);
  check("H3 and the pending-moves index is emptied", (await readJson<unknown[]>("rooms/moves-pending.json", [])).length, 0);
  const h3m = await D.updateBooking(erinA, h3b.id, h3b.date, inp(S8.id, "2030-01-07", 600, 660, { title: "Half moved" }), e8);
  check("H3 a normal move leaves no moving mark", [status(h3m), (await D.findBooking(S8.id, "2030-01-07", h3b.id))?.moving], ["ok", undefined]);

  // H4 the picker lists only people who can be booked for
  const listed = (await (await peopleRoute.GET(get(erin, "/api/bookings/people"))).json()) as { id: string }[];
  check("H4 a Viewer is not offered, a member is", [listed.some((x) => x.id === "gone"), listed.some((x) => x.id === "cara")], [false, true]);

  // H5 the activity log keeps no messages, reasons or addresses
  const withAsk = (await D.findBooking(S8.id, "2029-10-16", h2a.value.bookings[0].id))!;
  const safe = JSON.stringify(D.logSafeBooking({ ...withAsk, requests: [{ token: "t", requesterId: "bob", requesterName: "Bob", requesterEmail: "bob@example.test", title: "x", message: "SECRET MESSAGE", attendeeCount: 1, status: "declined", declineReason: "SECRET REASON", createdAt: "x" }] }));
  check("H5 safe log detail: no email, message or reason, but a count", [safe.includes("@"), safe.includes("SECRET"), safe.includes('"requestCount":1')], [false, false, true]);

  // H6 an end-date repeat over the limit is refused, not cut short
  const tooLong = await D.createBooking(erinA, inp(S8.id, "2030-02-01", 600, 660, { recurrence: { frequency: "daily", interval: 1, weekdays: [], endMode: "date", count: 1, until: "2030-04-01" } }), e8);
  check("H6 60-day daily repeat refused with the count", [status(tooLong), !tooLong.ok && tooLong.error], [400, "That repeat makes 60 bookings; the most is 52. Pick an earlier end date."]);

  // H7 a create racing a retire: the retire's cancelled rows stay, nothing is resurrected, and the reply says retired
  const r7 = await mkRoom("Retire Seven");
  let fired7 = false;
  putHook.put = async (...a: unknown[]) => {
    const res = await realPut(...a);
    if (!fired7 && String(a[0]).endsWith(`rooms/bookings/${r7.id}/2030-03.json`)) {
      fired7 = true;
      await D.saveRoom(admin, r7.id, { active: false }); // retires and cancels upcoming bookings
    }
    return res;
  };
  const c7 = await D.createBooking(erinA, inp(r7.id, "2030-03-04", 600, 660, { title: "Racing retire" }), e8);
  putHook.put = realPut;
  const rows7 = await readJson<Booking[]>(`rooms/bookings/${r7.id}/2030-03.json`, []);
  check("H7 refused, saying the room was retired", [status(c7), !c7.ok && c7.error.includes("was retired")], [409, true]);
  check("H7 the row the retire cancelled stays as the record", rows7.map((b) => b.status), ["cancelled"]);

  // H8 a refused ask leaves no pointer; a pointer write failure takes the request back out
  const pointers = () => [...store.keys()].filter((k) => k.includes("rooms/requests/")).length;
  const h8 = await D.createBooking(erinA, inp(S8.id, "2030-05-06", 600, 660), e8);
  if (!h8.ok) throw new Error("create failed");
  const h8b = h8.value.bookings[0];
  await D.requestRoom(bob, S8.id, h8b.date, h8b.id, { title: "x", message: "y", attendeeCount: 1 }, e8);
  const before8 = pointers();
  check("H8 a refused second ask", status(await D.requestRoom(bob, S8.id, h8b.date, h8b.id, { title: "x", message: "y", attendeeCount: 1 }, e8)), 409);
  check("H8 leaves no pointer behind", pointers(), before8);
  putHook.put = async (...a: unknown[]) => {
    if (String(a[0]).includes("rooms/requests/")) throw new Error("store down");
    return realPut(...a);
  };
  const h8fail = await quiet(() => D.requestRoom(cara, S8.id, h8b.date, h8b.id, { title: "x", message: "y", attendeeCount: 1 }, e8).then(() => "returned", () => "threw"));
  putHook.put = realPut;
  check("H8 pointer failure throws and takes the request back out", [h8fail, (await D.findBooking(S8.id, h8b.date, h8b.id))?.requests.some((q) => q.requesterId === "cara")], ["threw", false]);

  // H9 one paced sender, shared with the action items
  check("H9 room mail uses the action items' paced sender", [readFileSync("lib/roomBookingNotify.ts", "utf8").includes("setTimeout"), readFileSync("lib/actionItemNotify.ts", "utf8").includes("export async function sendPaced")], [false, true]);

  // ======================= ninth review =======================
  const S9 = await mkRoom("Hall Nine");
  const e9 = new Date("2030-06-01T00:00:00Z");
  const copies = async (bookingId: string) =>
    (await Promise.all(["2030-07", "2030-08", "2030-09"].map((m) => readJson<Booking[]>(`rooms/bookings/${S9.id}/${m}.json`, [])))).flat().filter((b) => b.id === bookingId);

  // I1 two cross-month edits of one booking at once: it survives exactly once
  const i1 = await D.createBooking(erinA, inp(S9.id, "2030-07-01", 600, 660, { title: "Twice moved" }), e9);
  if (!i1.ok) throw new Error("create failed");
  const i1b = i1.value.bookings[0];
  const [m1, m2] = await Promise.all([
    D.updateBooking(erinA, i1b.id, i1b.date, inp(S9.id, "2030-08-05", 600, 660, { title: "Twice moved" }), e9),
    D.updateBooking(miaA, i1b.id, i1b.date, inp(S9.id, "2030-08-12", 600, 660, { title: "Twice moved" }), e9),
  ]);
  const i1c = await copies(i1b.id);
  check("I1 concurrent moves to one month: the booking exists exactly once, confirmed", [i1c.length, i1c.filter((b) => b.status === "confirmed").length], [1, 1]);
  check("I1 and at most one of them succeeded", [m1.ok, m2.ok].filter(Boolean).length <= 1, true);
  const i1b2 = await D.createBooking(erinA, inp(S9.id, "2030-07-08", 600, 660, { title: "Split moved" }), e9);
  if (!i1b2.ok) throw new Error("create failed");
  const i1x = i1b2.value.bookings[0];
  await Promise.all([
    D.updateBooking(erinA, i1x.id, i1x.date, inp(S9.id, "2030-08-19", 600, 660, { title: "Split moved" }), e9),
    D.updateBooking(miaA, i1x.id, i1x.date, inp(S9.id, "2030-09-02", 600, 660, { title: "Split moved" }), e9),
  ]);
  check("I1 concurrent moves to two months: still exactly once", (await copies(i1x.id)).length, 1);
  check("I1 no move left pending", (await readJson<unknown[]>("rooms/moves-pending.json", [])).length, 0);

  // I8 a move is listed in the pending index while in flight
  const i8 = await D.createBooking(erinA, inp(S9.id, "2030-07-15", 600, 660), e9);
  if (!i8.ok) throw new Error("create failed");
  const i8b = i8.value.bookings[0];
  let seenPending = -1;
  putHook.put = async (...a: unknown[]) => {
    if (seenPending < 0 && String(a[0]).endsWith(`rooms/bookings/${S9.id}/2030-07.json`)) {
      seenPending = (await readJson<{ bookingId: string }[]>("rooms/moves-pending.json", [])).filter((x) => x.bookingId === i8b.id).length;
    }
    return realPut(...a);
  };
  await D.updateBooking(erinA, i8b.id, i8b.date, inp(S9.id, "2030-08-26", 600, 660), e9);
  putHook.put = realPut;
  check("I8 listed while in flight, cleared after", [seenPending, (await readJson<unknown[]>("rooms/moves-pending.json", [])).length], [1, 0]);

  // I5 a decline recorded on the old copy mid-move survives the merge
  const i5 = await D.createBooking(erinA, inp(S9.id, "2030-07-22", 600, 660), e9);
  if (!i5.ok) throw new Error("create failed");
  const i5b = i5.value.bookings[0];
  const i5q = await D.requestRoom(bob, S9.id, i5b.date, i5b.id, { title: "x", message: "y", attendeeCount: 1 }, e9);
  if (!i5q.ok) throw new Error("request failed");
  const undoI5 = injectOnSecondRead(`${S9.id}/2030-07.json`, (b) => ({
    ...b,
    requests: b.requests.map((q) => (q.token === i5q.value.request.token ? { ...q, status: "declined" as const, declineReason: "No", respondedAt: "2099-01-01T00:00:00.000Z" } : q)),
    updatedAt: new Date(Date.parse(b.updatedAt) + 5).toISOString(),
  }), i5b.id);
  await D.updateBooking(erinA, i5b.id, i5b.date, inp(S9.id, "2030-09-09", 600, 660), e9);
  undoI5();
  check("I5 the later decline wins over the move's withdrawal", (await D.findBooking(S9.id, "2030-09-09", i5b.id))?.requests.find((q) => q.token === i5q.value.request.token)?.status, "declined");

  // I6 the pointer is corrected if the booking moved before it was written
  const i6 = await D.createBooking(erinA, inp(S9.id, "2030-07-29", 600, 660), e9);
  if (!i6.ok) throw new Error("create failed");
  const i6b = i6.value.bookings[0];
  let relocated = false;
  putHook.put = async (...a: unknown[]) => {
    const res = await realPut(...a);
    if (!relocated && String(a[0]).includes("rooms/requests/")) {
      relocated = true; // the booking moves (raw, no pointer rewrite) right after the pointer is written
      const jul = await readJson<Booking[]>(`rooms/bookings/${S9.id}/2030-07.json`, []);
      const row = jul.find((b) => b.id === i6b.id)!;
      await writeJson(`rooms/bookings/${S9.id}/2030-07.json`, jul.filter((b) => b.id !== i6b.id));
      const sep = await readJson<Booking[]>(`rooms/bookings/${S9.id}/2030-09.json`, []);
      await writeJson(`rooms/bookings/${S9.id}/2030-09.json`, [...sep, { ...row, date: "2030-09-16" }]);
    }
    return res;
  };
  const i6q = await D.requestRoom(bob, S9.id, i6b.date, i6b.id, { title: "x", message: "y", attendeeCount: 1 }, e9);
  putHook.put = realPut;
  if (!i6q.ok) throw new Error("request failed");
  const i6v = await D.getRequestView(erinA, i6q.value.request.token);
  check("I6 the request link still opens after the booking moved", i6v.ok && i6v.value.booking.date, "2030-09-16");

  // I2 a 07:00 meeting booked the day before is reminded at once; a late cron still catches a never-reminded one
  const { remindNowIfBeforeNextRun: remindNow } = await import("../lib/roomBookingNotify");
  const i2 = await D.createBooking(erinA, inp(S9.id, "2030-10-08", 420, 480), e9); // Tue 07:00
  if (!i2.ok) throw new Error("create failed");
  check("I2 07:00 meeting booked the day before at 15:00: reminded at once", await remindNow(i2.value.bookings[0], S9, new Date("2030-10-07T13:00:00Z")), true);
  const i2b = await D.createBooking(erinA, inp(S9.id, "2030-10-09", 420, 480), e9); // Wed 07:00, never reminded
  if (!i2b.ok) throw new Error("create failed");
  const lateFire = new Date("2030-10-09T05:10:00Z"); // the cron fires 10 minutes late
  check("I2 late cron: a meeting started 10 minutes ago, never reminded, is still due", (await D.bookingsDueForReminder(lateFire)).some((x) => x.booking.id === i2b.value.bookings[0].id), true);
  check("I2 but not 30 minutes after it started", (await D.bookingsDueForReminder(new Date("2030-10-09T05:30:00Z"))).some((x) => x.booking.id === i2b.value.bookings[0].id), false);

  // I3 edits that move or re-hold, and approves, also remind at once when due before the next run
  check("I3 edit route reminds at once", readFileSync("app/api/bookings/[id]/route.ts", "utf8").includes("remindNowIfBeforeNextRun(after, room)"), true);
  check("I3 approve route reminds at once", readFileSync("app/api/bookings/request/[token]/route.ts", "utf8").includes("remindNowIfBeforeNextRun(after, room)"), true);

  // I4 a reminder claim refuses a booking that changed since it was read
  const i4 = await D.createBooking(erinA, inp(S9.id, "2030-11-04", 600, 660), e9);
  const i4m = await D.createBooking(erinA, inp(S9.id, "2030-11-05", 600, 660), e9);
  if (!i4.ok || !i4m.ok) throw new Error("create failed");
  const read4 = i4.value.bookings[0];
  await D.cancelBooking(erinA, S9.id, read4.date, read4.id, "one", e9);
  check("I4 cancelled between read and claim: not claimed", await D.claimReminder(read4, "2030-11-04T05:00:00.000Z", null), false);
  const read4m = i4m.value.bookings[0];
  await D.updateBooking(erinA, read4m.id, read4m.date, inp(S9.id, read4m.date, 720, 780), e9);
  check("I4 moved within the month between read and claim: not claimed", await D.claimReminder(read4m, "2030-11-05T05:00:00.000Z", null), false);


  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
