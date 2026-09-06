import { branding } from "./branding";

// ---------------------------------------------------------------------------
// Governance positions + terminology, by school type.
//
// Public / government schools are governed by an SGB (School Governing Body),
// per SASA. Independent / private schools have no SGB — they're governed by a
// Board of Governors / Directors / Trustees, so every SGB role has a Board
// equivalent. The lists/labels below are chosen by the school's type, which is
// set per-tenant in branding.ts (schoolType) — the first thing you pick when
// onboarding a school. HVPS + Jeppe are "public", so they see the SGB list
// exactly as before.
// ---------------------------------------------------------------------------

const isPrivate = branding.schoolType === "private";

// Public / government school (SGB) positions.
export const PUBLIC_POSITIONS = [
  "Principal",
  "Deputy Principal",
  "SGB Chairperson",
  "SGB Vice Chairperson",
  "SGB Treasurer",
  "Secretary",
  "Head of Fundraising",
  "Grounds and Building",
  "Business Administration",
  "Maintenance Manager",
  "Co-opted SGB",
  "IT & E-learning",
];

// Independent / private school (Board) equivalents — 1:1 with the public list.
export const PRIVATE_POSITIONS = [
  "Head of School / Principal",
  "Deputy Head",
  "Chairperson of the Board",
  "Deputy / Vice-Chair of the Board",
  "Treasurer / Chair of Finance Committee",
  "Board Secretary / Company Secretary",
  "Head of Fundraising",
  "Grounds and Building",
  "Business Administration",
  "Maintenance Manager",
  "Co-opted / Independent Board Member",
  "IT & E-learning",
];

export const POSITIONS_BY_TYPE = {
  public: PUBLIC_POSITIONS,
  private: PRIVATE_POSITIONS,
} as const;

// The active position list for THIS deployment (chosen by the school's type).
export const POSITIONS = isPrivate ? PRIVATE_POSITIONS : PUBLIC_POSITIONS;

// Short label for the governing body — used in UI copy ("Manage {X} positions").
export const GOVERNANCE_LABEL = isPrivate ? "Board" : "SGB";

// "SGB Member" / "Board Member" — used in role names + conflict-of-interest lists.
export const GOVERNANCE_MEMBER_LABEL = isPrivate ? "Board Member" : "SGB Member";

// The governance positions whose holders must approve spend (same four roles,
// named per school type). MUST be a subset of POSITIONS so getPeopleByPositions
// matches. Order is the public→private 1:1 mapping.
export const APPROVER_POSITIONS = isPrivate
  ? [
      "Head of School / Principal",
      "Treasurer / Chair of Finance Committee",
      "Chairperson of the Board",
      "Deputy / Vice-Chair of the Board",
    ]
  : ["Principal", "SGB Treasurer", "SGB Chairperson", "SGB Vice Chairperson"];

// Default conflict-of-interest "supplier connection" options (type-aware).
export const DEFAULT_SUPPLIER_CONNECTIONS = [
  "None",
  "Parent",
  GOVERNANCE_MEMBER_LABEL,
  "Friend of Parent",
  "Teacher",
  "Relative of Teacher",
  "Relative of Parent",
  `Relative of ${GOVERNANCE_MEMBER_LABEL}`,
];

/**
 * Which governance position signs in which capacity.
 *
 * 🔴 By INDEX, not by matching words in the name. The public and private lists
 * above are a deliberate 1:1 mapping, so index 2 is the chair of the governing
 * body whichever list a school is on. A rule like `name.includes("Chair")`
 * would match "Treasurer / Chair of Finance Committee" as the chair of the
 * board, and would break the first time a school renamed a position or a list
 * gained an Afrikaans equivalent.
 */
const PRINCIPAL = 0;
const CHAIR = 2;
const VICE_CHAIR = 3;

export function signatoryRoleForPosition(
  position: string | undefined
): "sgb_chair" | "principal" | "deputy_chair" | "other" {
  const i = POSITIONS.indexOf((position || "").trim());
  if (i === PRINCIPAL) return "principal";
  if (i === CHAIR) return "sgb_chair";
  if (i === VICE_CHAIR) return "deputy_chair";
  return "other";
}
