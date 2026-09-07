import { v4 as uuidv4 } from "uuid";
import type { Person } from "./peopleData";
import type { ActionItem } from "./actionItems";
import type { SpendApplication } from "./spend";
import type { MinutesRecord } from "./minutesData";
import { DEFAULT_REMINDER } from "./actionItems";

// ---------------------------------------------------------------------------
// The demo school's contents.
//
// Carl: "what if we build a new school or st bothians and i add some fake
// entries (or you do) and then we use that for the screenshots?"
//
// It exists so the standard guide can carry REAL screenshots of the product
// without carrying any real school's records. The guide HVPS published embeds
// 19 pictures of a live school: names off its governance register, its project
// names, its CAPEX figures. This is the honest way to get the same pictures.
//
// It doubles as the thing to show a prospect on a call, which is why it is a
// permanent school and a repeatable seed rather than a one-off script.
//
// ---------------------------------------------------------------------------
// 🔴 THREE RULES, and every one of them is here for a reason.
//
// 1. EVERY email address ends in `.example`. RFC 2606 reserves that TLD and it
//    resolves nowhere, ever. So a stray reminder, a minutes distribution or a
//    misfired notification cannot reach a real person, and cannot bounce
//    against a domain that exists and damage the sending reputation of
//    schoolcompliance.co.za.
//
// 2. NOTHING is borrowed from a live school. Not a supplier, not an amount, not
//    a project name. The temptation is to copy Hurlyvale's real figures to make
//    the screenshots look convincing, and that is exactly how a client's
//    numbers end up in a document every other client reads.
//
// 3. The school is called "Demo Primary School". A more realistic invented name
//    photographs better, and risks being an actual school somewhere in the
//    country. Nobody looking at these screenshots should be able to wonder
//    whose records they are.
// ---------------------------------------------------------------------------

const DOMAIN = "demoprimary.example";
const mail = (name: string) => `${name}@${DOMAIN}`;

/** Fixed so re-seeding produces the same ids, and a screenshot taken today
 *  still matches the guide's text tomorrow. */
const id = (n: string) => `demo-${n}`;

export const DEMO_SCHOOL_NAME = "Demo Primary School";

// --- The governing body ----------------------------------------------------

interface Seed {
  key: string;
  position: string;
  name: string;
  email: string;
}

const BODY: Seed[] = [
  { key: "principal", position: "Principal", name: "Nomsa Khumalo", email: mail("n.khumalo") },
  { key: "deputy", position: "Deputy Principal", name: "Pieter van Wyk", email: mail("p.vanwyk") },
  { key: "chair", position: "SGB Chairperson", name: "Fatima Adams", email: mail("f.adams") },
  { key: "vice", position: "SGB Vice Chairperson", name: "Sipho Ndlovu", email: mail("s.ndlovu") },
  { key: "treasurer", position: "SGB Treasurer", name: "Karen Botha", email: mail("k.botha") },
  { key: "secretary", position: "Secretary", name: "Thabo Molefe", email: mail("t.molefe") },
  { key: "fundraising", position: "Head of Fundraising", name: "Aisha Patel", email: mail("a.patel") },
  { key: "grounds", position: "Grounds and Building", name: "Johan Steyn", email: mail("j.steyn") },
  { key: "it", position: "IT & E-learning", name: "Lerato Mahlangu", email: mail("l.mahlangu") },
];

const who = (key: string) => BODY.find((p) => p.key === key)!;

export function demoPeople(): Person[] {
  return BODY.map((p) => ({
    id: id(`person-${p.key}`),
    position: p.position,
    userId: null,
    name: p.name,
    email: p.email,
    phone: "",
    profilePic: "",
  }));
}

// --- Dates -----------------------------------------------------------------
//
// Relative to today, so the grid always shows a live mix of overdue, due soon
// and comfortable rather than a wall of red on a screenshot taken next year.

const day = 86_400_000;
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * day).toISOString();
const isoDate = (offsetDays: number) => iso(offsetDays).slice(0, 10);

// --- Action items ----------------------------------------------------------

export function demoActions(minutesId: string, minutesTitle: string): ActionItem[] {
  const base = {
    updates: [],
    reminder: DEFAULT_REMINDER,
    raisedById: id("person-secretary"),
    raisedByName: who("secretary").name,
    createdAt: iso(-21),
    updatedAt: iso(-2),
  };

  const from = {
    minutesId,
    minutesTitle,
    minutesPeriod: "This term",
  };

  return [
    {
      ...base,
      id: id("action-1"),
      ref: "A-001",
      title: "Renew the fire compliance certificate",
      description:
        "The certificate expires at the end of the term. Arrange the inspection and file the renewed certificate under Policies.",
      assigneeIds: [id("person-grounds")],
      assigneeNames: [who("grounds").name],
      category: "Compliance",
      priority: "high",
      dueDate: isoDate(-4), // overdue, so the grid shows that styling
      status: "in_progress",
      progress: 60,
      fromMinutes: { ...from, sectionTitle: "Grounds and maintenance" },
    },
    {
      ...base,
      id: id("action-2"),
      ref: "A-002",
      title: "Obtain three quotes for the hall roof repair",
      description:
        "Roof leaked during the last storm. Three written quotes needed before the next finance meeting.",
      assigneeIds: [id("person-treasurer"), id("person-grounds")],
      assigneeNames: [who("treasurer").name, who("grounds").name],
      category: "Infrastructure",
      priority: "high",
      dueDate: isoDate(5),
      status: "in_progress",
      progress: 35,
      fromMinutes: { ...from, sectionTitle: "Grounds and maintenance" },
    },
    {
      ...base,
      id: id("action-3"),
      ref: "A-003",
      title: "Circulate the draft budget to the governing body",
      description: "Draft budget for the coming year, for comment before it is tabled.",
      assigneeIds: [id("person-treasurer")],
      assigneeNames: [who("treasurer").name],
      category: "Finance",
      priority: "medium",
      dueDate: isoDate(12),
      status: "not_started",
      progress: 0,
      fromMinutes: { ...from, sectionTitle: "Finance report" },
    },
    {
      ...base,
      id: id("action-4"),
      ref: "A-004",
      title: "Update the learner code of conduct",
      description:
        "Flagged by the last compliance check as out of date against the current regulations.",
      assigneeIds: [id("person-deputy")],
      assigneeNames: [who("deputy").name],
      category: "Policy",
      priority: "medium",
      dueDate: isoDate(24),
      status: "not_started",
      progress: 0,
    },
    {
      ...base,
      id: id("action-5"),
      ref: "A-005",
      title: "Confirm the athletics day date with the district",
      description: "Date needs confirming before the term calendar goes out to parents.",
      assigneeIds: [id("person-principal")],
      assigneeNames: [who("principal").name],
      category: "Governance",
      priority: "low",
      dueDate: isoDate(-11),
      status: "done",
      progress: 100,
      completedAt: iso(-12),
    },
  ];
}

// --- A funding application, mid approval -----------------------------------

export function demoSpend(): SpendApplication[] {
  return [
    {
      id: id("spend-1"),
      projectName: "Hall roof repair",
      description:
        "The hall roof leaked in three places during the last storm. Repair the sheeting and replace the guttering along the north side before the winter term.",
      estimatedAmount: 42500,
      supplierConnection: "None",
      budgeted: true,
      sourceOfFunds: "CAPEX, Fundraising",
      fundingAllocations: [
        { source: "CAPEX", amount: 30000 },
        { source: "Fundraising", amount: 12500 },
      ],
      quotes: [],
      quoteDetails: [
        {
          supplierName: "Northwind Roofing",
          supplierEmail: mail("quotes.northwind"),
          supplierPhone: "011 555 0101",
          priceExclVat: 42500,
        },
        {
          supplierName: "Cobus Sheet Metal",
          supplierEmail: mail("quotes.cobus"),
          supplierPhone: "011 555 0102",
          priceExclVat: 47900,
        },
        {
          supplierName: "Summit Roof Care",
          supplierEmail: mail("quotes.summit"),
          supplierPhone: "011 555 0103",
          priceExclVat: 51200,
        },
      ],
      // Left mid approval on purpose: one approved, one still outstanding, so
      // the screenshot shows the chain doing its job rather than a finished
      // row that explains nothing.
      status: "pending",
      submittedBy: id("person-grounds"),
      submittedByName: who("grounds").name,
      applicantName: "Johan",
      applicantSurname: "Steyn",
      applicantEmail: who("grounds").email,
      submittedOnBehalf: false,
      preferredQuotes: [{ userId: id("person-principal"), quoteIndex: 0 }],
      submittedAt: iso(-9),
      projectProgress: "not_started",
      approvals: [
        {
          userId: id("person-principal"),
          userName: who("principal").name,
          position: "Principal",
          decision: "approved",
          comments: "Agreed, this cannot wait for the next budget cycle.",
          decidedAt: iso(-7),
          preferredQuoteIndex: 0,
        },
      ],
      approvalTierLabel: "Over R10 000",
    },
    {
      id: id("spend-2"),
      projectName: "Library book replenishment",
      description: "Replacement readers for the Grade 3 and 4 reading scheme.",
      estimatedAmount: 8400,
      supplierConnection: "None",
      budgeted: true,
      sourceOfFunds: "Fundraising",
      fundingAllocations: [{ source: "Fundraising", amount: 8400 }],
      quotes: [],
      quoteDetails: [
        {
          supplierName: "Pageturner Educational",
          supplierEmail: mail("quotes.pageturner"),
          priceExclVat: 8400,
        },
      ],
      status: "completed",
      submittedBy: id("person-fundraising"),
      submittedByName: who("fundraising").name,
      applicantName: "Aisha",
      applicantSurname: "Patel",
      applicantEmail: who("fundraising").email,
      submittedOnBehalf: false,
      preferredQuotes: [],
      submittedAt: iso(-40),
      projectProgress: "completed",
      approvals: [
        {
          userId: id("person-principal"),
          userName: who("principal").name,
          position: "Principal",
          decision: "approved",
          comments: "",
          decidedAt: iso(-38),
        },
      ],
      approvalTierLabel: "R5 000 to R10 000",
    },
  ];
}

// --- A signed set of minutes -----------------------------------------------

export function demoMinutes(): MinutesRecord {
  const now = new Date();
  return {
    id: id("minutes-1"),
    title: "SGB meeting",
    body: "sgb",
    period: { kind: "month", year: now.getFullYear(), month: now.getMonth() + 1 },
    status: "signed",
    sections: [
      {
        id: id("sec-1"),
        title: "Attendance and apologies",
        body: `Present: ${who("chair").name} (Chair), ${who("principal").name} (Principal), ${who("treasurer").name} (Treasurer), ${who("secretary").name} (Secretary), ${who("grounds").name}.\nApologies: ${who("vice").name}.`,
        order: 1,
        responsible: who("secretary").name,
      },
      {
        id: id("sec-2"),
        title: "Matters arising from the previous meeting",
        body: "The athletics day date has been confirmed with the district and the term calendar has gone out to parents. All other matters were carried forward.",
        order: 2,
        numberingStartsHere: true,
        responsible: who("principal").name,
      },
      {
        id: id("sec-3"),
        title: "Finance report",
        body: "The Treasurer tabled the year to date figures. Fee collection is tracking close to budget. The draft budget for next year will be circulated for comment before it is tabled.",
        order: 3,
        responsible: who("treasurer").name,
      },
      {
        id: id("sec-4"),
        title: "Grounds and maintenance",
        body: "The hall roof leaked in three places during the last storm. Three quotes have been requested and the application has gone to the finance committee. The fire compliance certificate expires at the end of term and the inspection is being arranged.",
        order: 4,
        responsible: who("grounds").name,
      },
      {
        id: id("sec-5"),
        title: "General",
        body: "No further business. The meeting closed at 19:40.",
        order: 5,
        responsible: who("chair").name,
      },
    ],
    signatories: [
      {
        personId: id("person-chair"),
        name: who("chair").name,
        email: who("chair").email,
        role: "sgb_chair",
        signedAt: iso(-5),
      },
      {
        personId: id("person-principal"),
        name: who("principal").name,
        email: who("principal").email,
        role: "principal",
        signedAt: iso(-5),
      },
    ],
    reviews: [],
    draftNumber: 2,
    createdAt: iso(-14),
    createdBy: who("secretary").email,
    updatedAt: iso(-5),
    signedAt: iso(-5),
  };
}
