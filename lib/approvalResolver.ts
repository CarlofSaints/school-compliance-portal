import {
  getApprovalSettings,
  tierForAmount,
  isPersonRequirement,
  isTagRequirement,
} from "./approvalSettings";
import { getTags, getTagMembers } from "./tagData";
import { getPeople } from "./peopleData";
import { getUsers } from "./userData";
import type { RequiredApprover } from "./approvalEngine";

// A frozen approver carries the group it came from in tagId/tagName, which is
// what approvalEngine.groupByTag buckets on. A requirement naming one person
// has no tag, so it gets a synthetic group key of its own — the same
// "person:<id>" convention tagData already uses for a tagged person with no
// login. One person is therefore one group of one, which "all of" satisfies.
export function personGroupKey(personId: string): string {
  return `person:${personId}`;
}

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
      warning: `"${tier.label}" has no approver set, so nobody has been asked to approve this. An admin needs to set one in Fund Application Approval Settings.`,
    };
  }

  const needsPeople = tier.requirements.some(isPersonRequirement);
  const [tags, people, users] = await Promise.all([
    getTags(),
    needsPeople ? getPeople() : Promise.resolve([]),
    needsPeople ? getUsers() : Promise.resolve([]),
  ]);
  const approvers: RequiredApprover[] = [];
  // Requirements that resolved to nobody at all — an empty tag, or a person
  // who has since been removed from the register.
  const unresolved: string[] = [];

  for (const requirement of tier.requirements) {
    if (isPersonRequirement(requirement)) {
      const person = people.find((p) => p.id === requirement.personId);

      if (!person) {
        unresolved.push("a removed person");
        continue;
      }

      // A person wired to a user approves AS that user, exactly as a tagged
      // person does — so the key matches the id their decision is recorded
      // under. Without a login they can be emailed and shown on the record,
      // but they cannot click Approve.
      const linked = person.userId
        ? users.find((u) => u.id === person.userId)
        : undefined;

      approvers.push({
        key: linked ? linked.id : personGroupKey(person.id),
        userId: linked?.id,
        personId: person.id,
        name: linked
          ? `${linked.name} ${linked.surname}`.trim()
          : person.name || person.position,
        email: linked?.email || person.email,
        tagId: personGroupKey(person.id),
        tagName: person.position,
        // One named human is a group of one; "all of" and "any one of" mean
        // the same thing, so store the stricter reading.
        mode: "all",
      });
      continue;
    }

    if (!isTagRequirement(requirement)) continue;

    const tag = tags.find((t) => t.id === requirement.tagId);
    const tagName = tag?.name || "a removed tag";
    const members = tag ? await getTagMembers(tag.id) : [];

    if (members.length === 0) {
      unresolved.push(tagName);
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

  // Nobody on the list can actually click Approve, so it would sit for ever.
  // Said separately from an empty requirement: the names ARE on the record and
  // will be emailed, which looks like it is working until nothing moves.
  const nobodyCanDecide =
    approvers.length > 0 && approvers.every((a) => !a.userId);

  const warning =
    unresolved.length > 0
      ? `Nobody is set as ${unresolved.join(" or ")}, so ${
          approvers.length > 0
            ? "part of this approval has nobody to action it."
            : "this application has nobody to approve it."
        }`
      : nobodyCanDecide
        ? "Everyone required to approve this is on the People register without a login, so nobody can action it. An admin needs to give them a login or change the band."
        : undefined;

  return {
    tierId: tier.id,
    tierLabel: tier.label,
    logOnly: false,
    approvers,
    warning,
  };
}
