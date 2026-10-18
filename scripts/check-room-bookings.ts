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
  const room = made.value;
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
  check("cancel series cancels every upcoming one left", cs.ok && cs.value.count, 3);

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
  check("booker cannot delete a room", status(await D.deleteRoom(alice, spare.value.id)), 403);
  const del1 = await D.deleteRoom(admin, spare.value.id);
  check("never-booked room is deleted", del1.ok && del1.value.retired, false);
  check("deleted room gone", await D.getRoom(spare.value.id), null);
  const del2 = await D.deleteRoom(admin, room.id);
  check("booked room is retired, not deleted", [del2.ok && del2.value.retired, (await D.getRoom(room.id))?.active], [true, false]);
  check("retired room takes no new bookings", status(await D.createBooking(alice, input("2027-11-01", "09:00", "10:00"))), 400);

  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
