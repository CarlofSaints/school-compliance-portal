import { NextRequest, NextResponse } from "next/server";
import { NO_CHANGE, readJson, updateJson } from "./controlData";
import { emptyBudget, type BudgetYear } from "./budget";
import { requireAnyPermission, requirePermission } from "./rolesData";

const pathOf = (year: number) => `budget/${year}.json`;

export const getBudget = (year: number) => readJson<BudgetYear>(pathOf(year), emptyBudget(year));

/** `change` may run more than once. Return NO_CHANGE to write nothing. */
export const changeBudget = (year: number, change: (b: BudgetYear) => BudgetYear | typeof NO_CHANGE) => updateJson<BudgetYear>(pathOf(year), emptyBudget(year), change);

const yearOf = (param: string) => (/^20\d\d$/.test(param) ? Number(param) : null);
const badYear = () => NextResponse.json({ error: "Choose a budget year." }, { status: 400 });

export async function guardView(req: NextRequest, param: string) {
  const session = await requireAnyPermission(req, ["view_budget", "manage_budget"]);
  if (session instanceof NextResponse) return session;
  const year = yearOf(param);
  return year ? { session, year } : badYear();
}

export async function guardManage(req: NextRequest, param: string) {
  const session = await requirePermission(req, "manage_budget");
  if (session instanceof NextResponse) return session;
  const year = yearOf(param);
  return year ? { session, year } : badYear();
}
