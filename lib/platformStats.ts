import { listTenants } from "./tenantRegistry";
import { runAsTenant } from "./tenantContext";
import { getUsers } from "./userData";
import { getPeople } from "./peopleData";
import { getSpendApplications } from "./spendData";
import { getActionItems } from "./actionItemData";
import { getPolicies } from "./policyData";
import type { Tenant } from "./tenant";

// ---------------------------------------------------------------------------
// The numbers on Carl's own dashboard: how many schools, how big each one is.
//
// Every figure here comes from reading INSIDE that school's own store, one
// school at a time, through runAsTenant. There is no cross-school index to
// read instead, and deliberately so: an index would be a second copy of the
// truth that drifts, and the whole point of a store per school is that nothing
// aggregates them by default.
// ---------------------------------------------------------------------------

export interface SchoolSummary {
  key: string;
  name: string;
  status: Tenant["status"];
  createdAt: string;
  hostnames: string[];
  /** Null when the school's store could not be read. Distinguished from zero
   *  on purpose: "we could not look" is not "there is nothing there". */
  users: number | null;
  people: number | null;
  policies: number | null;
  spendApplications: number | null;
  actionItems: number | null;
  /** Present when the read failed, so the UI can say why rather than showing
   *  a school that looks empty. */
  error?: string;
}

/** Reads one school's counts. Never throws: one unreadable school must not
 *  blank the whole dashboard. */
async function summarise(tenant: Tenant): Promise<SchoolSummary> {
  const base = {
    key: tenant.key,
    name: tenant.name,
    status: tenant.status,
    createdAt: tenant.createdAt,
    hostnames: tenant.hostnames,
  };

  try {
    return await runAsTenant(tenant.key, async () => {
      // In parallel: five small reads against one store, and they do not
      // depend on each other.
      const [users, people, policies, spend, actions] = await Promise.all([
        getUsers(),
        getPeople(),
        getPolicies(),
        getSpendApplications(),
        getActionItems(),
      ]);
      return {
        ...base,
        users: users.length,
        people: people.length,
        policies: policies.length,
        spendApplications: spend.length,
        actionItems: actions.length,
      };
    });
  } catch (err) {
    console.error(`[platform] Could not read school "${tenant.key}":`, err);
    return {
      ...base,
      users: null,
      people: null,
      policies: null,
      spendApplications: null,
      actionItems: null,
      error: err instanceof Error ? err.message : "Could not read this school",
    };
  }
}

export interface PlatformOverview {
  schools: SchoolSummary[];
  totals: {
    schools: number;
    active: number;
    suspended: number;
    users: number;
    /** How many schools' figures could not be read, so a total that is missing
     *  some schools is never presented as if it were complete. */
    unreadable: number;
  };
}

export async function platformOverview(): Promise<PlatformOverview> {
  const tenants = await listTenants();

  // Sequential rather than Promise.all across schools. Each school is five
  // blob reads, and the account's operation limit is shared across every
  // school on the platform - firing 50 schools at once would spike it for
  // everyone using the product at that moment.
  const schools: SchoolSummary[] = [];
  for (const t of tenants) schools.push(await summarise(t));

  return {
    schools,
    totals: {
      schools: schools.length,
      active: schools.filter((s) => s.status === "active").length,
      suspended: schools.filter((s) => s.status === "suspended").length,
      users: schools.reduce((n, s) => n + (s.users ?? 0), 0),
      unreadable: schools.filter((s) => s.error).length,
    },
  };
}
