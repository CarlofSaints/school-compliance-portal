// Budget totals, fees and reading a school's Excel. No store needed: all pure.
//
//   npx tsx scripts/check-budget.ts
import { byGroup, cleanFee, cleanLine, feeAfter, guessColumns, numberIn, parseGrid, totals, type BudgetLine } from "../lib/budget";

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
};

const line = (o: Partial<BudgetLine>): BudgetLine => ({ id: "x", centre: "main", kind: "income", group: "G", code: "", name: "n", actual: 0, lastBudget: 0, amount: 0, note: "", items: [], ...o });
const lines = [line({ amount: 100 }), line({ kind: "expense", amount: 40 }), line({ kind: "expense", amount: 999, items: [{ label: "a", amount: 70 }, { label: "b", amount: 30 }] })];
check("items replace a line's amount", totals(lines).expense === 140);
check("a shortfall is negative", totals([line({ kind: "expense", amount: 5 })]).surplus === -5);
check("groups keep their order and add up", byGroup([line({ group: "B", amount: 1 }), line({ group: "A", amount: 2 }), line({ group: "B", amount: 3 })]).map((g) => `${g.name}${g.amount}`).join() === "B4,A2");

const plan = { lastFee: 12000, months: 12, roundTo: 10 };
check("fee rounds the monthly amount", feeAfter(plan, 7) === 1070 * 12);
check("fee never divides by nothing", feeAfter({ lastFee: 100, months: 0, roundTo: 0 }, 0) === 100);

const centres = [{ id: "main", name: "School" }];
check("line needs a name", cleanLine({ group: "G", kind: "income", centre: "main" }, centres) === "Give the line a name.");
check("line needs a real centre", typeof cleanLine({ name: "n", group: "G", kind: "income", centre: "nope" }, centres) === "string");
check("a nonsense amount is nothing", (cleanLine({ name: "n", group: "G", kind: "income", centre: "main", amount: "abc" }, centres) as BudgetLine).amount === 0);
check("fee plan needs a real centre", cleanFee({ centre: "nope" }, centres) === null);
check("spreadsheet errors read as nothing", numberIn("#DIV/0!") === 0 && numberIn("R 1 200,5".replace(",", ".")) === 1200.5 && numberIn("(50)") === -50);

// An accounting export: summary rows at the top, groups, dormant accounts, notes beside the figures.
const coded: unknown[][] = [
  ["SCHOOL BUDGET"],
  ["Income", "", "", "", 999999],
  ["Expenses", "", "", "", 888888],
  ["", "", "ACTUAL YTD 2026", "BUDGET 2026", 2027],
  ["Income"],
  ["410000 Fees", "", 900, 1000, 1100],
  ["410100 Fees Received", "", 900, 1000, 1200, "7% increase"],
  ["410200 Discount", "", 0, 0, -100, 0.5],
  ["420000 Interest", "", 5, 10, 20],
  ["430000 Dormant Group", "", 0, 0, 0],
  ["430100 Dormant Line", "", 0, 0, 0],
  ["", "", 905, 1010, 1120],
  ["Expenses"],
  ["610000 Admin", "", 0, 0, 900],
  ["610100 Audit", "", 0, 50, 700, "#DIV/0!", "New auditor"],
  ["612000 Insurance", "", 0, 0, 200],
  ["650000 Salaries", "", 0, 0, 400],
  ["  650200 Remuneration-38A", "", 100, 200, 400],
  ["615000 Educational", "", 0, 0, 50],
  ["615100 Books", "", 0, 0, 50],
  ["", "", 100, 250, 1350],
];
const col = guessColumns(coded, 2027);
check("columns found from the headings", col.amount === 4 && col.actual === 2 && col.lastBudget === 3);
const { lines: parsed, dormant } = parseGrid(coded, col);
const sum = totals(parsed.map((l) => line(l)));
check("group rows are not counted twice", sum.income === 1120 && sum.expense === 1350);
  check("a line with a round code stays a line inside its group", parsed.find((l) => l.code === "612000")?.group === "Admin");
  check("the next group starts once the total is reached", parsed.find((l) => l.code === "615100")?.group === "Educational");
check("income and spending told apart", parsed.filter((l) => l.kind === "expense").length === 4);
check("a group with no lines beneath is itself a line", parsed.some((l) => l.name === "Interest" && l.amount === 20));
check("lines sit in their group", parsed.find((l) => l.code === "650200")?.group === "Salaries" && parsed.find((l) => l.code === "650200")?.name === "Remuneration-38A");
check("the note is kept, an error is not", parsed.find((l) => l.code === "610100")?.note === "New auditor" && parsed.find((l) => l.code === "410100")?.note === "7% increase");
const crossing = parseGrid([["Income"], ["415000 Fundraising", "", 0, 50, 0], ["415100 Raffle", "", 0, 0, 0], ["Expenses"], ["616000 Admin", "", 0, 0, 30], ["616100 Audit", "", 0, 0, 30]], { amount: 4, actual: 3, lastBudget: 2 });
check("a group short of its total stops at the next section", totals(crossing.lines.map((l) => line(l))).expense === 30 && crossing.lines.find((l) => l.name === "Audit")?.group === "Admin");
const halfCodes = parseGrid([["Expenses"], ["612000 Admin", "", 0, 0, 70], ["612100 Audit", "", 0, 0, 40], ["612200 Bank", "", 0, 0, 30], ["617500 Educational", "", 0, 0, 20], ["617600 Books", "", 0, 0, 20]], { amount: 4, actual: 3, lastBudget: 2 });
check("a group code ending 500 is still a group", totals(halfCodes.lines.map((l) => line(l))).expense === 90 && halfCodes.lines.find((l) => l.name === "Books")?.group === "Educational");
const twins = parseGrid([["Expenses"], ["610000 Admin", "", 0, 0, 200], ["610100 Audit", "", 0, 0, 100], ["610200 Bank", "", 0, 0, 100]], { amount: 4, actual: 3, lastBudget: 2 });
check("two equal lines are not mistaken for a group and its line", totals(twins.lines.map((l) => line(l))).expense === 200);
check("dormant accounts left out and counted", dormant === 1 && !parsed.some((l) => l.name.startsWith("Dormant")));

const plain = parseGrid([["Item", "Amount"], ["Income"], ["Fees", 500], ["Total income", 500], ["Expenses"], ["Rent", 200], ["Surplus", 300]], { amount: 1, actual: -1, lastBudget: -1 });
check("a plain list with no codes reads, totals skipped", totals(plain.lines.map((l) => line(l))).income === 500 && totals(plain.lines.map((l) => line(l))).expense === 200);

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
