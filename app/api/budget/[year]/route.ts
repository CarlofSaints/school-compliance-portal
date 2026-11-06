import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { STARTER, cleanFee, cleanLine, emptyFeePlan, lineAmount, rollFeePlan, type BudgetLine, type BudgetYear } from "@/lib/budget";
import { changeBudget, getBudget, guardManage, guardView } from "@/lib/budgetData";
import { NO_CHANGE } from "@/lib/controlData";
import { isDate } from "@/lib/section38a";

type Ctx = { params: Promise<{ year: string }> };
const MAX_LINES = 3000;
const LOCKED = "This budget has been approved. Undo the approval to change it.";

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await guardView(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await getBudget(auth.year), { headers: { "Cache-Control": "no-store" } });
}

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// One route, one guarded write for each action, so two people working on different lines keep both.
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await guardManage(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  const { session, year } = auth;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const by = `${session.name} ${session.surname}`.trim();

  let problem = "";
  let status = 400;
  let log = "";
  const refuse = (message: string, code = 400): typeof NO_CHANGE => {
    problem = message;
    status = code;
    return NO_CHANGE;
  };

  // Read before the write: the change below may run twice, and must not read last year twice over.
  const last = b.action === "copy" ? await getBudget(year - 1) : null;

  const saved = await changeBudget(year, (y): BudgetYear | typeof NO_CHANGE => {
    problem = "";
    log = "";
    if (b.action === "unapprove") {
      if (!y.approved) return NO_CHANGE;
      log = `Undid the approval of the ${year} budget`;
      const { approved: _approved, ...rest } = y;
      return rest;
    }
    if (y.approved) return refuse(LOCKED, 409);

    switch (b.action) {
      case "saveLine": {
        // An edit sends only what changed, so an overlapping save keeps the other field.
        const id = text(b.id, 60);
        const old = y.lines.find((l) => l.id === id);
        if (id && !old) return refuse("That line has been removed. Reload the page.", 409);
        const clean = cleanLine({ ...old, ...((b.line ?? {}) as Record<string, unknown>) }, y.centres);
        if (typeof clean === "string") return refuse(clean);
        if (old) {
          log = old.amount !== clean.amount ? `Changed budget line ${clean.name} for ${year} from ${old.amount} to ${clean.amount}` : `Edited budget line ${clean.name} for ${year}`;
          return { ...y, lines: y.lines.map((l) => (l.id === id ? { ...clean, id } : l)) };
        }
        if (y.lines.length >= MAX_LINES) return refuse("That is too many lines.");
        log = `Added budget line ${clean.name} for ${year}`;
        return { ...y, lines: [...y.lines, { ...clean, id: randomUUID() }] };
      }
      case "deleteLine": {
        const line = y.lines.find((l) => l.id === b.id);
        if (!line) return NO_CHANGE;
        log = `Removed budget line ${line.name} for ${year}`;
        return { ...y, lines: y.lines.filter((l) => l.id !== b.id) };
      }
      case "importLines": {
        if (!Array.isArray(b.lines) || !b.lines.length) return refuse("There are no lines in that sheet.");
        if (b.lines.length > MAX_LINES) return refuse("That is too many lines.");
        const lines: BudgetLine[] = [];
        for (const raw of b.lines as Record<string, unknown>[]) {
          const clean = cleanLine({ ...raw, centre: b.centre, items: [] }, y.centres);
          if (typeof clean === "string") return refuse(`${clean} (${text(raw?.name) || "a line with no name"})`);
          lines.push({ ...clean, id: randomUUID() });
        }
        const centre = y.centres.find((c) => c.id === b.centre)!;
        log = `Loaded ${lines.length} budget lines into ${centre.name} for ${year}`;
        return { ...y, lines: [...y.lines.filter((l) => l.centre !== centre.id), ...lines] };
      }
      case "starter": {
        const centre = y.centres.find((c) => c.id === b.centre);
        if (!centre) return refuse("Choose where this line belongs.");
        if (y.lines.some((l) => l.centre === centre.id)) return refuse("This already has lines.", 409);
        log = `Started the ${centre.name} budget for ${year} from the standard list`;
        const lines = STARTER.flatMap((s) => s.lines.map((name): BudgetLine => ({ id: randomUUID(), centre: centre.id, kind: s.kind, group: s.group, code: "", name, actual: 0, lastBudget: 0, amount: 0, note: "", items: [] })));
        return { ...y, lines: [...y.lines, ...lines] };
      }
      case "copy": {
        if (y.lines.length) return refuse("This year already has lines.", 409);
        if (!last?.lines.length) return refuse("There is no budget for last year to copy.", 404);
        log = `Started the ${year} budget from ${year - 1}`;
        const ids = new Map(last.lines.map((l) => [l.id, randomUUID()]));
        return {
          ...y,
          centres: last.centres,
          // Actuals belong to a year not yet known, so they are left for the upload.
          lines: last.lines.map((l) => ({ ...l, id: ids.get(l.id)!, actual: 0, lastBudget: lineAmount(l) })),
          fees: last.fees.map((f) => rollFeePlan({ ...emptyFeePlan(f.centre), ...f }, ids)),
        };
      }
      case "addCentre": {
        const name = text(b.name, 60);
        if (!name) return refuse("Give it a name.");
        if (y.centres.some((c) => c.name.toLowerCase() === name.toLowerCase())) return refuse("That name is already used.", 409);
        log = `Added ${name} to the ${year} budget`;
        return { ...y, centres: [...y.centres, { id: randomUUID(), name }] };
      }
      case "removeCentre": {
        if (y.centres.length < 2) return refuse("A budget needs at least one part.");
        if (y.lines.some((l) => l.centre === b.id)) return refuse("Remove its lines first.", 409);
        return { ...y, centres: y.centres.filter((c) => c.id !== b.id), fees: y.fees.filter((f) => f.centre !== b.id) };
      }
      case "saveFee": {
        const current = y.fees.find((f) => f.centre === b.centre) ?? emptyFeePlan(text(b.centre, 60));
        const plan = cleanFee({ ...current, ...((b.plan ?? {}) as object), centre: b.centre }, y.centres);
        if (!plan) return refuse("Choose where this line belongs.");
        return { ...y, fees: [...y.fees.filter((f) => f.centre !== plan.centre), plan] };
      }
      case "useFee": {
        // The line and the choice in one write, so neither can be saved without the other.
        const old = y.lines.find((l) => l.id === b.lineId);
        if (!old) return refuse("That line has been removed. Reload the page.", 409);
        const clean = cleanLine({ ...old, amount: b.amount, note: b.note, items: [] }, y.centres);
        if (typeof clean === "string") return refuse(clean);
        const current = y.fees.find((f) => f.centre === b.centre) ?? emptyFeePlan(text(b.centre, 60));
        const plan = cleanFee({ ...current, ...((b.plan ?? {}) as object), centre: b.centre, feeLineId: old.id }, y.centres);
        if (!plan) return refuse("Choose where this line belongs.");
        log = `Put school fees of ${clean.amount} on ${clean.name} for ${year}`;
        return { ...y, lines: y.lines.map((l) => (l.id === old.id ? { ...clean, id: old.id } : l)), fees: [...y.fees.filter((f) => f.centre !== plan.centre), plan] };
      }
      case "approve": {
        if (!isDate(b.date)) return refuse("Give the date of the meeting that approved it.");
        if (!y.lines.length) return refuse("There is nothing to approve yet.");
        log = `Marked the ${year} budget as approved on ${b.date}`;
        return { ...y, approved: { date: b.date, by, note: text(b.note, 300) } };
      }
      default:
        return refuse("That action is not known.");
    }
  });

  if (problem) return NextResponse.json({ error: problem }, { status });
  if (log) await recordActivity({ ...actorFrom(req, session), action: `budget.${String(b.action)}`, entity: "budget", entityId: String(year), summary: log });
  return NextResponse.json(saved);
}
