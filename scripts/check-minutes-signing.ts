// Signing, with no server.
//
//   npx tsx scripts/check-minutes-signing.ts
//
// 🔴 The claim a signature makes is "this person agreed to THIS document". The
// two things that have to hold for that to be true, rather than a story we tell
// about a button click:
//
//   1. the code cannot be guessed, reused, or read out of storage
//   2. the hash changes when the document changes, and only then

import {
  canonicalMinutes,
  normaliseSigningCode,
  signatureMatchesDocument,
  signingProgress,
  canOpenSigning,
  SIGNING_ALPHABET,
  type MinutesSection,
  type Signatory,
} from "../lib/minutes";
import {
  decodeSignature,
  SignatureError,
  mintSigningCode,
  hashSigningCode,
  signingCodeMatches,
  shortHash,
} from "../lib/minutesSigning";
import { signatoryRoleForPosition } from "../lib/positions";
import { PUBLIC_POSITIONS } from "../lib/positions";

import zlib from "zlib";

/** A real PNG, built by hand, so the decoder is tested against actual bytes
 *  rather than against a string that merely looks like an image. */
function signaturePng(w: number, h: number): Buffer {
  const crcTable = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    let crc = 0xffffffff;
    for (const b of td) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    const cb = Buffer.alloc(4);
    cb.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, td, cb]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = [...Array(h)].map(() =>
    Buffer.concat([Buffer.from([0]), Buffer.concat([...Array(w)].map(() => Buffer.from([26, 26, 46])))])
  );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
  }
}
const checkThat = (label: string, cond: boolean) => check(label, cond, true);

const ID = "m-1";

const sections: MinutesSection[] = [
  { id: "a", title: "Attendance", body: "Present: Dee, Rob.", order: 1 },
  { id: "b", title: "Finance", body: "R52,000 approved.", order: 2, responsible: "Kevin James" },
];
const minutes = {
  title: "SGB meeting, 7 May 2026",
  body: "sgb" as const,
  period: { kind: "month" as const, year: 2026, month: 5 },
  sections,
};

console.log("\nThe code is one somebody can read off an email and type");
{
  const codes = [...Array(200)].map(() => mintSigningCode());
  checkThat("every code is 6 characters", codes.every((c) => c.length === 6));
  checkThat(
    "only unambiguous characters",
    codes.every((c) => [...c].every((ch) => SIGNING_ALPHABET.includes(ch)))
  );
  // O/0 and I/1/L get misread and turn a signature into a support call.
  checkThat("no O, 0, I, 1 or L", codes.every((c) => !/[O0I1L]/.test(c)));
  // Not proof of a good CSPRNG, but 200 identical codes would be a real bug.
  checkThat("codes differ", new Set(codes).size > 190);
}

console.log("\nTyping it the way a person types it still works");
{
  const code = "AB2CD3";
  const hash = hashSigningCode(code, ID);
  checkThat("exactly as sent", signingCodeMatches(code, ID, hash));
  checkThat("lowercase", signingCodeMatches("ab2cd3", ID, hash));
  checkThat("with a pasted space", signingCodeMatches(" AB2CD3 ", ID, hash));
  checkThat("with the hyphen people add", signingCodeMatches("AB2-CD3", ID, hash));
  check("normalising is what does it", normaliseSigningCode(" ab2-cd3 "), "AB2CD3");
}

console.log("\n\u{1F534} A code cannot be lifted, reused or matched elsewhere");
{
  const code = "AB2CD3";
  const hash = hashSigningCode(code, ID);
  // The plain code is never stored, so reading the record does not let you sign.
  checkThat("the stored value is not the code", !hash.includes(code));
  check("it is a sha-256", hash.length, 64);

  // Salted with the minutes id: the same code on another set of minutes is a
  // different hash, so one leaked hash cannot be replayed against another
  // meeting.
  checkThat("the same code hashes differently per minutes", hashSigningCode(code, "m-2") !== hash);
  check("and does not verify there", signingCodeMatches(code, "m-2", hash), false);

  check("a wrong code does not match", signingCodeMatches("ZZZZZZ", ID, hash), false);
  check("an empty code does not match", signingCodeMatches("", ID, hash), false);
  // 🔴 A signatory with no code issued must not be signable by anyone.
  check("no stored hash means nobody can sign", signingCodeMatches("AB2CD3", ID, undefined), false);
  check("and an empty code against no hash is still no", signingCodeMatches("", ID, undefined), false);
  // A malformed stored value must be a refusal, not a crash.
  check("a junk stored hash refuses", signingCodeMatches(code, ID, "not-a-hash"), false);
}

console.log("\n\u{1F534} The hash covers the document, and changes when it does");
{
  const base = canonicalMinutes(minutes);

  const retitled = canonicalMinutes({ ...minutes, title: "SGB meeting, 8 May 2026" });
  checkThat("a changed title changes it", retitled !== base);

  const edited = canonicalMinutes({
    ...minutes,
    sections: [sections[0], { ...sections[1], body: "R520,000 approved." }],
  });
  checkThat("an edited figure changes it", edited !== base);

  const reassigned = canonicalMinutes({
    ...minutes,
    sections: [sections[0], { ...sections[1], responsible: "Somebody Else" }],
  });
  checkThat("a changed responsible person changes it", reassigned !== base);

  // Flagged on the SECOND section, so Attendance loses its number and Finance
  // becomes 1. Flagging the FIRST one would render identically to no flag at
  // all, and the hash covers the numbers a reader sees rather than the flag
  // that produced them, so it would rightly be unchanged.
  const renumbered = canonicalMinutes({
    ...minutes,
    sections: [sections[0], { ...sections[1], numberingStartsHere: true }],
  });
  checkThat("a changed numbering start changes it", renumbered !== base);

  const cosmetic = canonicalMinutes({
    ...minutes,
    sections: [{ ...sections[0], numberingStartsHere: true }, sections[1]],
  });
  check("a flag that changes no number changes no hash", cosmetic, base);

  const reordered = canonicalMinutes({
    ...minutes,
    sections: [
      { ...sections[0], order: 2 },
      { ...sections[1], order: 1 },
    ],
  });
  checkThat("reordering the sections changes it", reordered !== base);

  const period = canonicalMinutes({
    ...minutes,
    period: { kind: "month", year: 2026, month: 6 },
  });
  checkThat("a changed period changes it", period !== base);
}

console.log("\nBut it is stable across things that are not the document");
{
  const base = canonicalMinutes(minutes);
  check("the same input twice", canonicalMinutes(minutes), base);

  // Array position must not matter, only `order`. The editor writes sections
  // back in whatever order the UI held them.
  const shuffled = canonicalMinutes({ ...minutes, sections: [sections[1], sections[0]] });
  check("array position does not matter", shuffled, base);

  // 🔴 Signatures are NOT in the hash. If they were, the record would change
  // its own hash as each person signed and nobody after the first could ever
  // be verified. Passed as a real record carrying signatures, so this fails if
  // canonicalMinutes ever starts reading them.
  const withSignatures = canonicalMinutes({
    ...minutes,
    signatories: [
      { personId: "1", name: "Dee", email: "d@x.test", role: "sgb_chair", signedAt: "2026-05-10T09:00:00.000Z" },
    ],
    status: "signed",
    draftNumber: 3,
  } as Parameters<typeof canonicalMinutes>[0]);
  check("adding a signature does not change it", withSignatures, base);

  // Windows line endings arrive from a paste out of Word. The same minutes
  // typed on a Mac and on a PC must not hash differently.
  // Typed as plain strings: with the literal types tsc reports the comparison
  // below as impossible, which is a compiler-time proof that they differ but
  // is also a build error.
  const LF: string = "Present: Dee\nApologies: Rob";
  const CRLF: string = "Present: Dee\r\nApologies: Rob";
  const multi = { ...sections[0], body: LF };
  const withLf = canonicalMinutes({ ...minutes, sections: [multi, sections[1]] });
  const withCrLf = canonicalMinutes({
    ...minutes,
    sections: [{ ...multi, body: CRLF }, sections[1]],
  });
  check("line endings are normalised", withCrLf, withLf);
  // The guard on the guard: those really are two different input strings, so
  // this cannot pass by comparing something with itself.
  checkThat("the CRLF case is not the same string", LF !== CRLF);

  const padded = canonicalMinutes({
    ...minutes,
    title: "  SGB meeting, 7 May 2026  ",
    sections: [{ ...sections[0], body: "Present: Dee, Rob.\n" }, sections[1]],
  });
  check("stray whitespace does not change it", padded, base);
}

console.log("\nA signature that no longer matches is shown, not recalculated");
{
  const signed: Signatory = {
    personId: "p1",
    name: "Dee Schoultz",
    email: "dee@x.test",
    role: "sgb_chair",
    signedAt: "2026-05-10T09:00:00.000Z",
    documentHash: "a".repeat(64),
  };
  checkThat("it matches its own hash", signatureMatchesDocument(signed, "a".repeat(64)));
  // 🔴 Evidence that a signed record was edited, so it must read as broken.
  check("a changed document breaks it", signatureMatchesDocument(signed, "b".repeat(64)), false);
  const unsigned: Signatory = { ...signed, signedAt: undefined, documentHash: undefined };
  check("somebody who has not signed never matches", signatureMatchesDocument(unsigned, "a".repeat(64)), false);

  check("a reference is short enough to compare by eye", shortHash("a".repeat(64)).length, 12);
  check("and is uppercase", shortHash("abc123" + "0".repeat(58)), "ABC1230000000".slice(0, 12));
  check("no hash gives an empty reference", shortHash(undefined), "");
}

console.log("\nThe round closes only when everyone has signed");
{
  const a: Signatory = { personId: "1", name: "Dee", email: "d@x.test", role: "sgb_chair" };
  const b: Signatory = { personId: "2", name: "Rob", email: "r@x.test", role: "principal" };
  const signed = (s: Signatory) => ({ ...s, signedAt: "2026-05-10T09:00:00.000Z" });

  check("nobody yet", signingProgress([a, b]).complete, false);
  check("one of two", signingProgress([signed(a), b]).signed, 1);
  check("and it is not complete", signingProgress([signed(a), b]).complete, false);
  check("the other is named", signingProgress([signed(a), b]).waitingOn, ["Rob"]);
  check("both", signingProgress([signed(a), signed(b)]).complete, true);
  // 🔴 Minutes with no signatories must never read as signed.
  check("an empty list is not complete", signingProgress([]).complete, false);
}

console.log("\n\u{1F534} The signing capacity comes from the position INDEX, not its words");
{
  // A rule like name.includes("Chair") reads "Treasurer / Chair of Finance
  // Committee" as the chair of the governing body.
  check("the principal", signatoryRoleForPosition(PUBLIC_POSITIONS[0]), "principal");
  check("the chair", signatoryRoleForPosition(PUBLIC_POSITIONS[2]), "sgb_chair");
  check("the vice chair", signatoryRoleForPosition(PUBLIC_POSITIONS[3]), "deputy_chair");
  check("the treasurer is not the chair", signatoryRoleForPosition("SGB Treasurer"), "other");
  check("an unknown position", signatoryRoleForPosition("Tuckshop"), "other");
  check("no position at all", signatoryRoleForPosition(undefined), "other");
  check("a padded position still matches", signatoryRoleForPosition("  Principal "), "principal");
  // The two lists are a deliberate 1:1, so the indices have to line up.
  check("both lists are the same length", PUBLIC_POSITIONS.length, 12);
}

console.log("\nWhen signing may be opened");
{
  check("from a plain draft", canOpenSigning("draft"), true);
  check("from one that came back", canOpenSigning("changes_requested"), true);
  check("from one out for checking", canOpenSigning("in_review"), true);
  // Already open: a signatory who lost their code asks for a new one instead,
  // which leaves everybody else's code working.
  check("not when already out for signing", canOpenSigning("awaiting_signatures"), false);
  check("not once signed", canOpenSigning("signed"), false);
  check("not once archived", canOpenSigning("archived"), false);
}


console.log("\n\u{1F534} What arrives from the browser is not trusted");
{
  // A canvas data URL is attacker-controlled text on a route any logged-in
  // signatory can call, so the decoder is the one place that decides what
  // counts as a signature image.
  const real = signaturePng(8, 4).toString("base64");
  const ok = decodeSignature(`data:image/png;base64,${real}`);
  // Dimensions come from the PNG's own IHDR chunk, not from anything the
  // caller claimed about it.
  check("a real PNG decodes, with its own dimensions", [ok.width, ok.height], [8, 4]);
  checkThat("and the bytes survive", ok.png.length > 0);

  const rejects = (label: string, input: string) => {
    let threw = false;
    try {
      decodeSignature(input);
    } catch (e) {
      threw = e instanceof SignatureError;
    }
    check(label, threw, true);
  };

  rejects("empty input", "");
  rejects("a bare string", "not a data url");
  rejects("empty base64", "data:image/png;base64,");
  rejects("a javascript url", "javascript:alert(1)");
  // 🔴 A JPEG relabelled as a PNG. The prefix is written by the caller, so
  // trusting it would store anything at all under a .png name and serve it
  // straight back with an image content type.
  rejects(
    "a lie about the type",
    "data:image/png;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).toString("base64")
  );
  // An SVG can carry script, which is why the decoder takes PNG only.
  rejects("an SVG", "data:image/svg+xml;base64," + Buffer.from("<svg/>").toString("base64"));
  rejects("a jpeg data url", "data:image/jpeg;base64," + real);
  // Capped, so nobody pushes a photo album through the signing route.
  rejects("something far too large", "data:image/png;base64," + "A".repeat(600 * 1024));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
