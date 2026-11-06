// Budget totals, fees and reading a school's Excel. No store needed: all pure.
//
//   npx tsx scripts/check-budget.ts
import { byGroup, chooseScenario, cleanFee, emptyFeePlan, feeIncome, feeLineIn, gradeRows, rollFeePlan, cleanLine, feeAfter, guessColumns, numberIn, parseGrid, totals, type BudgetLine } from "../lib/budget";

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
const fees = [line({ name: "School Fees Received", lastBudget: 900 }), line({ name: "Early Payment Discount", lastBudget: -5 }), line({ name: "Application Fee", lastBudget: 950 }), line({ name: "Late Fee Interest", lastBudget: 999 }), line({ name: "Arrear fees received", lastBudget: 40 }), line({ name: "Feeding Scheme", lastBudget: 9999 }), line({ name: "Coffee", lastBudget: 9999 }), line({ name: "Uniform Sales", lastBudget: 5000 })];
check("the fee line is found by itself", feeLineIn(fees)?.name === "School Fees Received");
check("Use this cannot move the guess: last year decides", feeLineIn([line({ name: "School fees", lastBudget: 900, amount: 0 }), line({ name: "Aftercare fees", lastBudget: 200, amount: 1000 })])?.name === "School fees");
check("a chosen line and fee survive cleaning", cleanFee({ centre: "main", feeLineId: "abc", chosenFee: 30030, chosenId: "x" }, [{ id: "main", name: "School" }])?.feeLineId === "abc");
const one = [{ id: "main", name: "School" }];
check("a new plan starts with one increase of 3%", emptyFeePlan("main").scenarios.length === 1 && emptyFeePlan("main").scenarios[0].increase === 3);
check("a saved plan with no increases still has one", cleanFee({ centre: "main", scenarios: [] }, one)?.scenarios.length === 1);
check("primary is Grade 0 to 7, high is 8 to 12", gradeRows({ phase: "primary", grades: [] }).map((g) => g.grade).join() === "0,1,2,3,4,5,6,7" && gradeRows({ phase: "high", grades: [] }).map((g) => g.grade).join() === "8,9,10,11,12");
const graded = { ...emptyFeePlan("main"), mode: "grades" as const, months: 12, roundTo: 10, grades: [{ grade: "1", lastFee: 12000, learners: 10 }, { grade: "7", lastFee: 24000, learners: 5 }], scenarios: [{ id: "s", increase: 10, byGrade: { "7": 0 } }], chosenId: "s" };
check("each grade uses its own increase", feeIncome(graded, graded.scenarios[0]) === 13200 * 10 + 24000 * 5);
const pickedGrades = { ...graded, ...chooseScenario(graded, graded.scenarios[0]) };
const rolled = rollFeePlan(pickedGrades, new Map());
check("next year starts from each grade's chosen fee", rolled.grades[0].lastFee === 13200 && rolled.grades[1].lastFee === 24000 && rolled.scenarios.length === 1 && !rolled.chosenId);
const base = { ...emptyFeePlan("main"), lastFee: 12000, months: 12, roundTo: 10, learners: 10 };
const picked = { ...base, ...chooseScenario(base, { id: "a", increase: 5 }) };
check("trying 8% afterwards does not change the fee that was chosen", rollFeePlan({ ...picked, scenarios: [{ id: "a", increase: 8 }] }, new Map()).lastFee === 12600);
check("removing the chosen increase keeps the chosen fee", rollFeePlan({ ...picked, scenarios: [{ id: "b", increase: 2 }] }, new Map()).lastFee === 12600);
check("a chosen grade fee survives cleaning", cleanFee({ centre: "main", chosenGrades: [{ grade: "1", fee: 5 }] }, one)?.chosenGrades?.[0].fee === 5);
check("nothing chosen means the fee is typed in again", rollFeePlan({ ...emptyFeePlan("main"), lastFee: 500 }, new Map()).lastFee === 0);
check("an old plan's chosen fee still carries over", rollFeePlan({ ...emptyFeePlan("main"), chosenFee: 700 }, new Map()).lastFee === 700);
check("a grade outside the list is refused", cleanFee({ centre: "main", grades: [{ grade: "99", lastFee: 1 }] }, one)?.grades.length === 0);
check("no fee line means the school chooses", feeLineIn([line({ name: "Tuition", amount: 9 })]) === null);
check("empty boxes behave as the server does: 11 months, no rounding", feeAfter({ lastFee: 110, months: 0, roundTo: 0 }, 0) === 110 && cleanFee({ centre: "main", months: 0, roundTo: 0 }, [{ id: "main", name: "School" }])?.months === 11);
check("a negative fee counts as nothing", feeAfter({ lastFee: -100, months: 12, roundTo: 10 }, 5) === 0);

const centres = [{ id: "main", name: "School" }];
check("line needs a name", cleanLine({ group: "G", kind: "income", centre: "main" }, centres) === "Give the line a name.");
check("line needs a real centre", typeof cleanLine({ name: "n", group: "G", kind: "income", centre: "nope" }, centres) === "string");
check("a nonsense amount is nothing", (cleanLine({ name: "n", group: "G", kind: "income", centre: "main", amount: "abc" }, centres) as BudgetLine).amount === 0);
check("fee plan needs a real centre", cleanFee({ centre: "nope" }, centres) === null);
check("spreadsheet errors read as nothing", numberIn("#DIV/0!") === 0 && numberIn("R 1 200,50") === 1200.5 && numberIn("1200,5") === 1200.5 && numberIn("1,200") === 1200 && numberIn("1 234 567") === 1234567 && numberIn("1.200,50") === 1200.5 && numberIn("(50)") === -50);

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
const c = { amount: 4, actual: 3, lastBudget: 2 };
const sumOf = (r: { lines: Parameters<typeof line>[0][] }) => totals(r.lines.map((l) => line(l)));
check("spending under any heading is spending", sumOf(parseGrid([["Income"], ["410100 Fees", "", 0, 0, 100], ["OPERATING EXPENSES"], ["610100 Audit", "", 0, 0, 40]], c)).expense === 40);
check("a line called Other Income is not a heading", parseGrid([["Expenses"], ["Rent", "", 0, 0, 5], ["Other Income", "", 0, 0, 7]], c).lines.every((l) => l.kind === "expense"));
check("a dormant line does not lose its group's figure", sumOf(parseGrid([["Income"], ["420000 Interest", "", 0, 0, 20], ["420100 Interest received", "", 0, 0, 0]], c)).income === 20);
check("a group short of its total does not swallow the next", sumOf(parseGrid([["Expenses"], ["610000 Admin", "", 0, 0, 100], ["610100 Audit", "", 0, 0, 90], ["612000 Edu", "", 0, 0, 50], ["612100 Books", "", 0, 0, 50]], c)).expense === 140);
const split = parseGrid([["Income"], ["410000", "Fees", 0, 0, 100], ["410100", "Received", 0, 0, 100]], c);
check("code and name in separate columns", sumOf(split).income === 100 && split.lines[0].name === "Received" && split.lines[0].group === "Fees");
check("labels starting in column B", parseGrid([["", "410100 Fees", 0, 0, 100]], c).lines.length === 1);
const typed = parseGrid([["Income"], ["410100 Fees", "", 0, 0, 100], ["Manual fundraising", "", 0, 0, 5000], ["Total income", "", 0, 0, 5100]], c);
check("a row with figures and no code is named, not lost", typed.skipped.join() === "Manual fundraising");
check("a year in the data is not a heading", guessColumns([["", 2027], ["410100 Fees", 2027]], 2027).amount === 1 && guessColumns([["410100 Fees", 2027], ["", "", 2027]], 2027).amount === -1);
check("dormant accounts left out and counted", dormant === 2 && !parsed.some((l) => l.name.startsWith("Dormant")));

const plain = parseGrid([["Item", "Amount"], ["Income"], ["Fees", 500], ["Total income", 500], ["Expenses"], ["Rent", 200], ["Surplus", 300]], { amount: 1, actual: -1, lastBudget: -1 });
check("a plain list with no codes reads, totals skipped", totals(plain.lines.map((l) => line(l))).income === 500 && totals(plain.lines.map((l) => line(l))).expense === 200);

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
