import { tk } from "./i18n/translate";

// ---------------------------------------------------------------------------
// Section 38A of SASA: an SGB may not pay a state employee extra without the
// Head of Department's approval, and s38A(9) recovers unapproved pay from the
// SGB members personally. One record per budget year, one entry per payment.
// Client-safe. Every status is derived here on each read, never stored.
//
// The wording comes from the DRAFT national Form 1 (GN 7796, Gazette 55155,
// 6 Aug 2026). A year keeps the form it was started on, so a final form or a
// provincial one can sit beside it.
// ---------------------------------------------------------------------------

export const FORM_DRAFT_2026 = "national-draft-2026";

export const BENEFITS = { remuneration: tk("Remuneration"), financial: tk("Other financial benefit"), in_kind: tk("Benefit in kind") };
export const ACTIVITIES = { sport: tk("Sport"), curriculum: tk("Curriculum"), arts: tk("Arts and culture"), tours: tk("Tours and excursions"), other: tk("Other") };
export const TIMES = { after_hours: tk("After hours"), weekends: tk("Weekends"), holidays: tk("School holidays"), other: tk("Other") };
export const PAYS = { monthly: tk("Monthly"), quarterly: tk("Quarterly"), once: tk("Once off"), hourly: tk("Per hour") };
export const SOURCES = { fees: tk("School fees"), donations: tk("Donations"), investments: tk("Investments"), bequests: tk("Bequests"), other: tk("Other") };

export type Benefit = keyof typeof BENEFITS;
export type Activity = keyof typeof ACTIVITIES;
export type Time = keyof typeof TIMES;
export type Pay = keyof typeof PAYS;
export type Source = keyof typeof SOURCES;
export type ChairLine = "sgb" | "finance";
export type Decision = "approved" | "refused";

/** What is held for a signing link. Only the hash: the link itself is in the email. */
export interface SignLink {
  hash: string;
  sentAt: string;
  sentBy: string;
  sentByEmail: string;
}

export interface Signature {
  name: string;
  at: string;
  dataUrl: string;
  kind: "drawn" | "typed";
  ip: string;
  /** Exactly what was signed. A signature stops counting once the terms differ. */
  terms: string;
}

/** The fields a person's application is made of. */
export interface EntryTerms {
  name: string;
  surname: string;
  email: string;
  persal: string;
  rank: string;
  benefit: Benefit;
  activities: Activity[];
  description: string;
  times: Time[];
  timesOther: string;
  pay: Pay;
  amount: number;
  /** Hours in the year. Only used when paid per hour. */
  hours: number;
  details: string;
}

export interface Entry extends EntryTerms {
  id: string;
  link?: SignLink;
  signature?: Signature;
  problem?: { note: string; at: string };
  decision?: Decision;
}

export interface Chair {
  name: string;
  email: string;
  link?: SignLink;
  signature?: Signature;
}

export interface SgbApproval {
  meetingDate: string;
  item: string;
  /** Who stepped out for this item. My suggestion, not from the Act or the form. */
  steppedOut: string;
  sections20: boolean;
  funds: boolean;
  affordable: boolean;
}

export interface FileRef {
  name: string;
  ext: string;
  at: string;
  by: string;
}

export interface Year {
  year: number;
  form: string;
  budgetDate: string;
  province: string;
  district: string;
  emis: string;
  budgetLine: number;
  sources: Source[];
  policyId: string;
  sgbTagId: string;
  financeTagId: string;
  approval: SgbApproval;
  people: Entry[];
  chairs: Partial<Record<ChairLine, Chair>>;
  lodged?: { date: string; how: string; reference: string; by: string; proof?: FileRef };
  letter?: FileRef;
}

export const emptyYear = (year: number): Year => ({
  year,
  form: FORM_DRAFT_2026,
  budgetDate: `${year - 1}-11-30`,
  province: "",
  district: "",
  emis: "",
  budgetLine: 0,
  sources: [],
  policyId: "",
  sgbTagId: "",
  financeTagId: "",
  approval: { meetingDate: "", item: "", steppedOut: "", sections20: false, funds: false, affordable: false },
  people: [],
  chairs: {},
});

// --- Sums and dates --------------------------------------------------------------

/** Form 1 Part B 4.2, the total maximum amount for the year. */
export function yearMax(e: Pick<EntryTerms, "pay" | "amount" | "hours">): number {
  const times = { monthly: 12, quarterly: 4, once: 1, hourly: e.hours }[e.pay];
  return Math.round(e.amount * times * 100) / 100;
}

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0));
  last.setUTCDate(Math.min(d, last.getUTCDate()));
  return last.toISOString().slice(0, 10);
}

/** s38A(4): at least four months before the budget is finalised. */
export const lodgeBy = (budgetDate: string) => addMonths(budgetDate, -4);
/** Draft reg 5(2): three months from receipt, then the SGB may appeal. */
export const decisionDue = (lodgedOn: string) => addMonths(lodgedOn, 3);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export const isDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

// --- Terms and signatures --------------------------------------------------------

export function entryTerms(y: Pick<Year, "year">, e: EntryTerms): string {
  return JSON.stringify([y.year, e.name, e.surname, e.persal, e.rank, e.benefit, e.activities, e.description, e.times, e.timesOther, e.pay, e.amount, e.hours, e.details]);
}

export function applicationTerms(y: Year): string {
  return JSON.stringify([y.emis, y.district, y.province, y.approval, y.people.map((e) => entryTerms(y, e))]);
}

export const employeeSigned = (y: Year, e: Entry) => e.signature?.terms === entryTerms(y, e);
export const chairSigned = (y: Year, c?: Chair) => !!c?.signature && c.signature.terms === applicationTerms(y);

export type EmployeeStatus = "not_sent" | "sent" | "signed" | "changed" | "problem";
export const EMPLOYEE_STATUS: Record<EmployeeStatus, string> = {
  not_sent: tk("Not sent"),
  sent: tk("Waiting to sign"),
  signed: tk("Signed"),
  changed: tk("Changed after signing"),
  problem: tk("Reported a problem"),
};

export function employeeStatus(y: Year, e: Entry): EmployeeStatus {
  if (e.problem) return "problem";
  if (employeeSigned(y, e)) return "signed";
  if (e.signature) return "changed";
  return e.link ? "sent" : "not_sent";
}

// --- Where the year stands -------------------------------------------------------

export const STEPS = [tk("Setup"), tk("People"), tk("Employees sign"), tk("SGB approves"), tk("Lodge"), tk("Decision")];

// Reg 10 and both sets of forms ban these, but a word in a box only warns: code does not decide what a bonus is.
const BANNED_WORDS = /\b(bonus|bonuses|gratuity|gratuities|fee exemption|school fees?)\b/i;

export function setupGaps(y: Year): string[] {
  const gaps: [boolean, string][] = [
    [!y.budgetDate, tk("Date the budget is finalised")],
    [!y.province, tk("Province")],
    [!y.district, tk("District")],
    [!y.emis, tk("EMIS number")],
    [!(y.budgetLine > 0), tk("Budget line for 38A, tax included")],
    [!y.sources.length, tk("Where the money comes from")],
    [!y.policyId, tk("Section 38A policy")],
  ];
  return gaps.filter(([gap]) => gap).map(([, label]) => label);
}

export function approvalGaps(y: Year): string[] {
  const a = y.approval;
  const gaps: [boolean, string][] = [
    [!a.meetingDate, tk("SGB meeting date")],
    [!a.item, tk("Minutes item")],
    [!a.sections20, tk("Sections 20(5) to (9) confirmed")],
    [!a.funds, tk("Funds confirmed")],
    [!a.affordable, tk("Affordability confirmed")],
  ];
  return gaps.filter(([gap]) => gap).map(([, label]) => label);
}

export interface Overview {
  lodgeBy: string;
  daysToLodge: number;
  total: number;
  budgetLeft: number;
  people: number;
  signed: number;
  approved: number;
  refused: number;
  chairsSigned: number;
  /** Index into STEPS of the first step not finished; STEPS.length when all are. */
  step: number;
  /** Stops lodging, by label. */
  gaps: string[];
  decisionDue: string | null;
  /** s38A(4) */
  late: boolean;
  /** s38A(8) */
  overBudget: boolean;
  wordsToCheck: { name: string; word: string }[];
}

export function overview(y: Year, today: string): Overview {
  const total = y.people.reduce((sum, e) => sum + yearMax(e), 0);
  const signed = y.people.filter((e) => employeeSigned(y, e)).length;
  const chairsSigned = [y.chairs.sgb, y.chairs.finance].filter((c) => chairSigned(y, c)).length;
  const approved = y.people.filter((e) => e.decision === "approved").length;
  const refused = y.people.filter((e) => e.decision === "refused").length;
  const setup = setupGaps(y);
  const sgb = approvalGaps(y);
  const allSigned = !!y.people.length && signed === y.people.length;
  const gaps = [
    ...setup,
    ...(y.people.length ? [] : [tk("At least one person")]),
    ...(y.people.length && !allSigned ? [tk("Every employee's signature")] : []),
    ...sgb,
    ...(chairsSigned < 2 ? [tk("Both chairs' signatures")] : []),
  ];
  const steps = [!setup.length, y.people.length > 0, allSigned, !sgb.length && chairsSigned === 2, !!y.lodged, !!y.people.length && approved + refused === y.people.length];
  const first = steps.indexOf(false);
  const by = lodgeBy(y.budgetDate);
  return {
    lodgeBy: by,
    daysToLodge: daysBetween(today, by),
    total,
    budgetLeft: y.budgetLine - total,
    people: y.people.length,
    signed,
    approved,
    refused,
    chairsSigned,
    step: first === -1 ? STEPS.length : first,
    gaps,
    decisionDue: y.lodged ? decisionDue(y.lodged.date) : null,
    late: (y.lodged?.date ?? today) > by,
    overBudget: total > y.budgetLine,
    wordsToCheck: y.people.flatMap((e) => {
      const word = BANNED_WORDS.exec(`${e.description} ${e.details}`)?.[0];
      return word ? [{ name: `${e.name} ${e.surname}`, word }] : [];
    }),
  };
}

// --- What reaches the browser ----------------------------------------------------

const safeLink = (l?: SignLink) => (l ? { sentAt: l.sentAt } : undefined);
const safeSignature = (s?: Signature) => (s ? { name: s.name, at: s.at } : undefined);

/** 🔴 Every year leaving the server goes through this: no link hashes, marks or IPs. */
export function yearForClient(y: Year) {
  return {
    ...y,
    people: y.people.map((e) => ({ ...e, link: safeLink(e.link), signature: safeSignature(e.signature), status: employeeStatus(y, e), max: yearMax(e) })),
    chairs: Object.fromEntries(
      (Object.entries(y.chairs) as [ChairLine, Chair][]).map(([line, c]) => [line, { name: c.name, email: c.email, link: safeLink(c.link), signature: safeSignature(c.signature), signed: chairSigned(y, c) }])
    ) as Partial<Record<ChairLine, { name: string; email: string; link?: { sentAt: string }; signature?: { name: string; at: string }; signed: boolean }>>,
  };
}
export type ClientYear = ReturnType<typeof yearForClient>;

// --- Checking what comes in ------------------------------------------------------

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, set: Record<T, string>): T | null => (typeof v === "string" && Object.hasOwn(set, v) ? (v as T) : null);
export const manyOf = <T extends string>(v: unknown, set: Record<T, string>): T[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is T => oneOf(x, set) !== null))] : [];

/** The form's fields, or what is wrong with them. Amount is required, so a benefit in kind always carries a value (draft reg 10(b)). */
export function cleanEntry(b: Record<string, unknown>): EntryTerms | string {
  const benefit = oneOf(b.benefit, BENEFITS);
  const pay = oneOf(b.pay, PAYS);
  const entry = {
    name: text(b.name, 80),
    surname: text(b.surname, 80),
    email: text(b.email, 120),
    persal: text(b.persal, 12),
    rank: text(b.rank, 80),
    activities: manyOf(b.activities, ACTIVITIES),
    description: text(b.description, 400),
    times: manyOf(b.times, TIMES),
    timesOther: text(b.timesOther, 300),
    amount: Math.round(Number(b.amount) * 100) / 100,
    hours: Number(b.hours) || 0,
    details: text(b.details, 1000),
  };
  if (!entry.name || !entry.surname) return "Give the person's first names and surname.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)) return "Give an email address: the form to sign goes there.";
  if (!/^\d{5,12}$/.test(entry.persal)) return "The PERSAL number must be digits only.";
  if (!entry.rank) return "Give the person's rank.";
  if (!benefit) return "Choose the type of payment.";
  if (!entry.activities.length) return "Choose at least one activity.";
  if (!entry.description || wordCount(entry.description) > 30) return "Describe the activities in 30 words or fewer.";
  if (!entry.times.length) return "Choose when the work is done.";
  if (entry.times.includes("other") && (!entry.timesOther || wordCount(entry.timesOther) > 20)) return "Describe the other time in 20 words or fewer.";
  if (!pay) return "Choose how it is paid.";
  if (!(entry.amount > 0)) return "Give the amount in rand.";
  if (pay === "hourly" && !(entry.hours > 0)) return "Give the hours in the year.";
  if (b.stateNotPaying !== true || b.noInterference !== true || b.coreActivity !== true) return "The SGB must confirm all three statements.";
  return { ...entry, benefit, pay, hours: pay === "hourly" ? entry.hours : 0, timesOther: entry.times.includes("other") ? entry.timesOther : "" };
}

// --- The form's undertakings, word for word --------------------------------------

export function sgbUndertaking(school: string, who: string) {
  return {
    intro: `We, the School Governing Body (SGB) of ${school} hereby declare and undertake to ensure compliance with the provisions of Section 38A of the South African Schools Act, 1996 (Act No. 84 of 1996) (the Act).`,
    points: [
      `We have applied to contract the services of ${who} for additional duties and responsibilities at the school in terms of the school's policy on section 38A of the Act.`,
      "We confirm that section 38A application served at the structures of the SGB and that the SGB approved the application for the next financial year.",
      "The additional duties and responsibilities will not interfere with the contractual obligations/duties of the state employee as contained and provided for in the Employment of Educators Act, 1998 (Act No. 76 of 1998) and/or the Public Service Act, 1994 (Proclamation No. 103 of 1994) and Personnel Administration Measures (PAM), with special reference to such duties, workloads and responsibilities as contained therein and apply to the relevant state employee.",
      "We are fully versed with and have taken cognisance of the relevant Acts and Regulations (including legislation about income tax) that impact on and have consequences for the contractual relationships created by Section 38A of the Act.",
      "The Department will not be held liable, vicariously or otherwise and in respect of any dispute that may arise from such contractual relationship as envisaged in terms of section 38A of the Act.",
      "We affirm and undertake to disclose such full details as to the nature and extent of such payments as required by Section 38A of the Act.",
      "We have complied with the provisions of Sections 20(5) to (9) of the Act.",
      "The school is financially able and willing to make such payments and declare that its assets will exceed its liabilities when making such payments and or award any benefit in kind.",
      "We affirm that we are fully aware of and understand the consequences of any fraudulent and corrupt practices that such payments may give rise to and possible prosecution of such persons as provided for in terms of section 4(1) the Prevention and Combatting of Corrupt Activities Act, 2004 (Act No. 12 of 2004) and the recovery of such unauthorised payments under section 38A (9) of the Act.",
    ],
  };
}

export function employeeUndertaking(y: Pick<Year, "province">, e: Pick<EntryTerms, "name" | "surname" | "persal">, school: string) {
  return {
    intro: `I, ${e.name} ${e.surname} (PERSAL number) ${e.persal} the undersigned, employed in the service of the ${y.province} Department of Education and stationed at ${school}`,
    points: [
      "Confirm that I have read and understood the provisions of Section 38A of the South African Schools Act as well as the conditions of my employment contract with the Department as provided for in terms of the Employment of Educators Act, 1998 (Act No.76 of 1998) and/or the Public Service Act, 1994 (Proclamation No. 103 of 1994), Personnel Administration Measures (PAM), with special reference to such duties, workloads and responsibilities as contained therein and apply to state employees.",
      "I am fully versed with and have taken cognisance of the relevant Acts and Regulations (including legislation pertaining to Income Tax) that impact on and have consequences for the additional remuneration for additional work done in terms of section 38A.",
      "I confirm that the Department will not be held liable in respect of any dispute that may arise from such a contractual relationship as envisaged in terms of Section 38A.",
      "I will not breach my contractual duties and obligations to my employer nor undertake such additional duties and obligations that may adversely impact on my ability to perform my functions as Educator/Administrative Support Staff.",
      "I affirm that I am fully aware of the consequences of any fraudulent and corrupt practices that such payments may give rise to, and the possible prosecution of such people as provided for in terms of section 3(1) of the Prevention and Combatting of Corrupt Activities Act, 2004 (Act No. 12 of 2004) and the recovery of such unauthorised payments under Section 38A(9) of the South African School Act, 1996 (Act No. 84 of 1996).",
    ],
  };
}

/** Draft reg 4(3): the written notice of willingness that goes with the application. */
export const WILLINGNESS = "I confirm that I am willing to do the additional work described in this application (regulation 4(3)).";
