import { readJson, writeJson } from "./controlData";

// One requirement inside a tier. Exactly one of tagId / personId identifies
// who must approve.
//
// A TAG names a group, and mode says how many of its members must say yes:
// "all" means every person carrying the tag, "any" means one of them is enough
// (a Principal tag with a deputy on it, say).
//
// A PERSON names one position-holder straight off the People register. The
// Principal is one named human, so requiring a one-member tag for them would
// only duplicate the register. mode is meaningless for a single person and is
// always stored as "all".
export interface ApprovalRequirement {
  tagId?: string;
  personId?: string;
  mode: "all" | "any";
}

// Requirements are stored with only the key they use, so a reader must never
// assume tagId is present. Use these rather than truthiness checks scattered
// about.
export function isTagRequirement(
  r: ApprovalRequirement
): r is ApprovalRequirement & { tagId: string } {
  return typeof r.tagId === "string" && r.tagId.length > 0;
}

export function isPersonRequirement(
  r: ApprovalRequirement
): r is ApprovalRequirement & { personId: string } {
  return typeof r.personId === "string" && r.personId.length > 0;
}

// A band of amounts and what it takes to approve inside it. Bands are
// inclusive of min and exclusive of max, so R5 000 lands in the 5 000-10 000
// tier rather than in both.
export interface ApprovalTier {
  id: string;
  label: string;
  minAmount: number;
  // null = no upper limit.
  maxAmount: number | null;
  // Logged only: no approval needed, the application is recorded and goes
  // straight through. This is the ONLY way an application auto-approves.
  logOnly: boolean;
  requirements: ApprovalRequirement[];
}

export interface ApprovalSettings {
  tiers: ApprovalTier[];
  // Whether the applicant is emailed on each individual approval, as well as
  // when the last one lands.
  notifyApplicantOnEachApproval: boolean;
}

const PATH = "settings/approval-settings.json";

// Bands matching the school's stated policy. They ship with NO tags attached,
// which is deliberate: a tier with no resolvable approver leaves an
// application sitting in "Applied" with a warning rather than approving it by
// default. Nothing auto-approves until an admin has said who approves it.
const DEFAULTS: ApprovalSettings = {
  tiers: [
    {
      id: "tier-logged",
      label: "Logged only, no approval needed",
      minAmount: 0,
      maxAmount: 5000,
      logOnly: true,
      requirements: [],
    },
    {
      id: "tier-principal",
      label: "Principal approval",
      minAmount: 5000,
      maxAmount: 10000,
      logOnly: false,
      requirements: [],
    },
    {
      id: "tier-fincom",
      label: "FINCOM approval",
      minAmount: 10000,
      maxAmount: null,
      logOnly: false,
      requirements: [],
    },
  ],
  notifyApplicantOnEachApproval: true,
};

export async function getApprovalSettings(): Promise<ApprovalSettings> {
  const saved = await readJson<ApprovalSettings>(PATH, DEFAULTS);
  return {
    tiers: sortTiers(saved.tiers || []),
    notifyApplicantOnEachApproval:
      saved.notifyApplicantOnEachApproval ?? true,
  };
}

export async function saveApprovalSettings(
  settings: ApprovalSettings
): Promise<void> {
  return writeJson(PATH, {
    ...settings,
    tiers: sortTiers(settings.tiers),
  });
}

export function sortTiers(tiers: ApprovalTier[]): ApprovalTier[] {
  return [...tiers].sort((a, b) => a.minAmount - b.minAmount);
}

// The tier an amount falls into. Returns null when the bands do not cover it,
// which the caller must treat as "needs a human", never as "approved".
export function tierForAmount(
  tiers: ApprovalTier[],
  amount: number
): ApprovalTier | null {
  const value = Number.isFinite(amount) ? amount : 0;
  return (
    sortTiers(tiers).find(
      (t) =>
        value >= t.minAmount &&
        (t.maxAmount === null || value < t.maxAmount)
    ) || null
  );
}

export function describeTier(tier: ApprovalTier): string {
  const from = `R${tier.minAmount.toLocaleString()}`;
  const to =
    tier.maxAmount === null
      ? "and above"
      : `up to R${tier.maxAmount.toLocaleString()}`;
  return `${from} ${to}`;
}

// Gaps and overlaps in the bands, so an admin is told before an application
// falls down a crack rather than afterwards.
export function validateTiers(tiers: ApprovalTier[]): string[] {
  const problems: string[] = [];
  const sorted = sortTiers(tiers);

  if (sorted.length === 0) {
    problems.push("No approval bands are set up yet.");
    return problems;
  }
  if (sorted[0].minAmount > 0) {
    problems.push(
      `Amounts under R${sorted[0].minAmount.toLocaleString()} are not covered by any band.`
    );
  }
  if (sorted[sorted.length - 1].maxAmount !== null) {
    problems.push(
      "The highest band has an upper limit, so very large amounts are not covered. Leave its maximum blank."
    );
  }

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.maxAmount !== null && t.maxAmount <= t.minAmount) {
      problems.push(`"${t.label}" ends at or before it starts.`);
    }
    const next = sorted[i + 1];
    if (!next) continue;
    if (t.maxAmount === null) {
      problems.push(`"${t.label}" has no upper limit but is not the last band.`);
    } else if (t.maxAmount < next.minAmount) {
      problems.push(
        `Nothing covers R${t.maxAmount.toLocaleString()} to R${next.minAmount.toLocaleString()}.`
      );
    } else if (t.maxAmount > next.minAmount) {
      problems.push(`"${t.label}" and "${next.label}" overlap.`);
    }
    if (!t.logOnly && t.requirements.length === 0) {
      problems.push(
        `"${t.label}" needs approval but no approver is set, so applications will wait with nobody to action them.`
      );
    }
  }
  const last = sorted[sorted.length - 1];
  if (!last.logOnly && last.requirements.length === 0) {
    problems.push(
      `"${last.label}" needs approval but no approver is set, so applications will wait with nobody to action them.`
    );
  }

  return problems;
}
