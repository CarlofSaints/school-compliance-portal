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
  console.log = ((orig) => (...a: unknown[]) => (String(a[0]).startsWith("[Email]") ? undefined : orig(...a)))(console.log);

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
  const pastOne = new Date("2027-03-10T11:00:00Z"); // 13:00 SAST, the meeting is under way
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

  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
