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
  const runAt = new Date("2027-10-04T05:00:00Z");
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
      return { ...res, blobs: [{ pathname: `${prefix}2027-12.json` }], hasMore: false };
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
  const eve = new Date("2027-12-20T05:00:00Z");
  const stamp2 = eve.toISOString();
  await D.claimReminder(r2b, stamp2, null);
  await D.finishReminder(r2b, stamp2, ["erin@example.test"], false); // as if Cara's send had failed
  check("F5 half-reminded booking is due again", (await D.bookingsDueForReminder(eve)).some((x) => x.booking.id === r2b.id), true);
  outbox.length = 0;
  await runRem(eve);
  check("F5 retry reaches only the holder who missed it", [mailTo("cara@example.test", "Tomorrow"), mailTo("erin@example.test", "Tomorrow")], [1, 0]);
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
  check("F6 create racing a delete is refused", status(racing), 400);
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

  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
