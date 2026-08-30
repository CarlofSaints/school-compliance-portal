import { getApprovalSettings, tierForAmount } from "./approvalSettings";
import { getTags, getTagMembers } from "./tagData";
import type { RequiredApprover } from "./approvalEngine";

export interface ResolvedApproval {
  tierId?: string;
  tierLabel?: string;
  logOnly: boolean;
  approvers: RequiredApprover[];
  // Set when nothing could be resolved. The caller must leave the application
  // waiting and surface this, never treat it as approved.
  warning?: string;
}

// Works out who must approve an application of this size, and freezes the list.
//
// Called once, when the application is submitted. Everything after that reads
// the frozen list rather than re-resolving, so changing a tag later cannot
// rewrite the requirements of an application already in flight.
export async function resolveApprovers(
  amount: number
): Promise<ResolvedApproval> {
  const settings = await getApprovalSettings();
  const tier = tierForAmount(settings.tiers, amount);

  if (!tier) {
    return {
      logOnly: false,
      approvers: [],
      warning: `R${amount.toLocaleString()} does not fall into any approval band. An admin needs to fix the bands in Fund Application Approval Settings.`,
    };
  }

  if (tier.logOnly) {
    return {
      tierId: tier.id,
      tierLabel: tier.label,
      logOnly: true,
      approvers: [],
    };
  }

  if (tier.requirements.length === 0) {
    return {
      tierId: tier.id,
      tierLabel: tier.label,
      logOnly: false,
      approvers: [],
      warning: `"${tier.label}" has no approver tag set, so nobody has been asked to approve this. An admin needs to set one in Fund Application Approval Settings.`,
    };
  }

  const tags = await getTags();
  const approvers: RequiredApprover[] = [];
  const emptyTags: string[] = [];

  for (const requirement of tier.requirements) {
    const tag = tags.find((t) => t.id === requirement.tagId);
    const tagName = tag?.name || "a removed tag";
    const members = tag ? await getTagMembers(tag.id) : [];

    if (members.length === 0) {
      emptyTags.push(tagName);
      continue;
    }

    for (const member of members) {
      approvers.push({
        key: member.key,
        userId: member.userId,
        personId: member.personId,
        name: member.name,
        email: member.email,
        tagId: requirement.tagId,
        tagName,
        mode: requirement.mode,
      });
    }
  }

  const warning =
    emptyTags.length > 0
      ? `Nobody is tagged as ${emptyTags.join(" or ")}, so ${
          approvers.length > 0
            ? "part of this approval has nobody to action it."
            : "this application has nobody to approve it."
        }`
      : undefined;

  return {
    tierId: tier.id,
    tierLabel: tier.label,
    logOnly: false,
    approvers,
    warning,
  };
}
