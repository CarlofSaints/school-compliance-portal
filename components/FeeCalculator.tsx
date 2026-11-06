"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/I18nProvider";
import { chooseScenario, emptyFeePlan, feeAfter, feeIncome, feeLineIn, gradeIncrease, gradeRows, lineAmount, monthsOf, rands, type BudgetLine, type FeePlan, type FeeScenario, type SchoolPhase } from "@/lib/budget";

const INPUT = "px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none disabled:bg-gray-50";
const newId = () => String(Date.now());

/**
 * Mount it with a key of year and part: it holds the plan as typed, so the figures
 * follow every keystroke and Use this acts on what is on screen, not what was last saved.
 */
export default function FeeCalculator({ stored, centre, lines, editable, onSave, onUse }: {
  stored: FeePlan | undefined;
  centre: string;
  lines: BudgetLine[];
  editable: boolean;
  onSave: (change: Partial<FeePlan>) => void;
  onUse: (line: BudgetLine, amount: number, note: string, change: Partial<FeePlan>) => Promise<boolean>;
}) {
  const t = useT();
  const [plan, setPlan] = useState<FeePlan>({ ...emptyFeePlan(centre), ...stored });
  const [changingLine, setChangingLine] = useState(false);
  // What has been typed and not saved. Leaving a box writes only if it changed something.
  const dirty = useRef(new Set<keyof FeePlan>());
  const update = (change: Partial<FeePlan>) => {
    (Object.keys(change) as (keyof FeePlan)[]).forEach((k) => dirty.current.add(k));
    setPlan((p) => ({ ...p, ...change }));
  };
  const saveIfChanged = (key: keyof FeePlan) => {
    if (dirty.current.delete(key)) onSave({ [key]: plan[key] });
  };
  const commit = (change: Partial<FeePlan>) => {
    setPlan((p) => ({ ...p, ...change }));
    onSave(change);
  };

  const feeLine = lines.find((l) => l.id === plan.feeLineId) ?? feeLineIn(lines);
  const months = monthsOf(plan);
  const perGrade = plan.mode === "grades";
  const rows = gradeRows(plan);
  const ready = perGrade ? rows.some((g) => g.lastFee && g.learners) : !!plan.lastFee && !!plan.learners;
  const signed = (n: number) => `${n < 0 ? "" : "+"}${rands(n)}`;
  const inBudget = (s: FeeScenario) => ready && s.id === plan.chosenId && !!feeLine && lineAmount(feeLine) === feeIncome(plan, s);

  const setScenarios = (scenarios: FeeScenario[]) => update({ scenarios });
  const addScenario = () => {
    const top = Math.max(0, ...plan.scenarios.map((s) => s.increase));
    commit({ scenarios: [...plan.scenarios, { id: newId(), increase: top + 1 }] });
  };
  const removeScenario = (id: string) => commit({ scenarios: plan.scenarios.filter((s) => s.id !== id) });
  const setColumn = (id: string, increase: number) => setScenarios(plan.scenarios.map((x) => (x.id === id ? { ...x, increase } : x)));
  // Emptying a grade's own box puts it back on the column's increase.
  const setGradeIncrease = (s: FeeScenario, grade: string, typed: string) => {
    const { [grade]: _old, ...others } = s.byGrade ?? {};
    setScenarios(plan.scenarios.map((x) => (x.id === s.id ? { ...x, byGrade: typed === "" ? others : { ...others, [grade]: Number(typed) } } : x)));
  };

  const numberBox = (value: number, onChange: (n: number) => void, onBlur: () => void, label: string, width = "w-28") => (
    <input type="number" min={0} aria-label={label} disabled={!editable} value={value || ""} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} onBlur={onBlur} className={`${INPUT} ${width}`} />
  );
  // A percentage: 0 shows as 0, and it may be negative.
  const percentBox = (value: number, onChange: (typed: string) => void) => (
    <input type="number" aria-label={t("Increase")} disabled={!editable} value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => saveIfChanged("scenarios")} className={`${INPUT} w-16`} />
  );
  const field = (key: "lastFee" | "months" | "roundTo" | "learners", label: string) => (
    <label className="text-sm">
      <span className="block text-gray-600 mb-1">{label}</span>
      {numberBox(plan[key], (n) => update({ [key]: n }), () => saveIfChanged(key), label, "w-36")}
    </label>
  );
  const useButton = (s: FeeScenario, note: string) =>
    inBudget(s) ? (
      <span className="text-xs font-medium text-emerald-700">{t("In the budget")}</span>
    ) : (
      editable &&
      feeLine && (
        <button
          disabled={!ready}
          onClick={async () => {
            const chosen = { ...chooseScenario(plan, s), feeLineId: feeLine.id };
            if (await onUse(feeLine, feeIncome(plan, s), note, chosen)) setPlan((p) => ({ ...p, ...chosen }));
          }}
          className="text-primary text-xs font-medium disabled:opacity-40"
        >
          {t("Use this")}
        </button>
      )
    );
  const removeButton = (s: FeeScenario) =>
    editable &&
    plan.scenarios.length > 1 && (
      <button onClick={() => removeScenario(s.id)} aria-label={t("Remove this increase")} className="text-risk-high text-xs ml-1">x</button>
    );
  const addButton = editable && (
    <button onClick={addScenario} className="text-primary text-xs font-medium whitespace-nowrap">{t("+ Add an increase")}</button>
  );

  return (
    <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <h2 className="font-semibold text-dark mb-1">{t("Work out school fees")}</h2>
      <p className="text-xs text-gray-500 mb-3">{t("See what each increase means for parents, then press Use this on the one you choose.")}</p>

      <div className="flex flex-wrap gap-4 mb-3 text-sm">
        {(["same", "grades"] as const).map((mode) => (
          <label key={mode} className="flex items-center gap-2">
            <input type="radio" name={`fee-mode-${centre}`} checked={plan.mode === mode} disabled={!editable} onChange={() => commit({ mode })} className="accent-primary" />
            {mode === "same" ? t("All grades pay the same") : t("Fees differ per grade")}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-3">
        {!perGrade && field("lastFee", t("Last year's fee for the year"))}
        {!perGrade && field("learners", t("Learners"))}
        {field("months", t("Months paid"))}
        {field("roundTo", t("Round the monthly fee to"))}
        {perGrade && (
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">{t("Grades")}</span>
            <select value={plan.phase} disabled={!editable} onChange={(e) => commit({ phase: e.target.value as SchoolPhase })} className={INPUT}>
              <option value="primary">{t("Primary, Grade 0 to 7")}</option>
              <option value="high">{t("High, Grade 8 to 12")}</option>
              <option value="combined">{t("Combined, Grade 0 to 12")}</option>
            </select>
          </label>
        )}
      </div>

      {editable && (
        <p className="text-xs text-gray-500 mb-2">
          {feeLine ? t("Use this puts the amount on the line {name}.", { name: feeLine.name }) : t("Choose the line for fee income.")}
          {feeLine && !changingLine && <button onClick={() => setChangingLine(true)} className="text-primary font-medium ml-2">{t("Change line")}</button>}
          {(!feeLine || changingLine) && (
            <select
              aria-label={t("Choose the line for fee income.")}
              value={feeLine?.id ?? ""}
              onChange={(e) => {
                setChangingLine(false);
                if (e.target.value) commit({ feeLineId: e.target.value });
              }}
              className={`${INPUT} text-xs ml-2`}
            >
              <option value="">-</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
        </p>
      )}

      <div className="overflow-x-auto">
        {perGrade ? (
          <table className="text-sm">
            <thead>
              <tr>
                <th className="text-left pr-4 py-1 font-medium text-gray-500">{t("Grade")}</th>
                <th className="text-left pr-4 py-1 font-medium text-gray-500">{t("Last year's fee for the year")}</th>
                <th className="text-left pr-4 py-1 font-medium text-gray-500">{t("Learners")}</th>
                {plan.scenarios.map((s) => (
                  <th key={s.id} className="text-left pr-4 py-1 font-medium text-gray-500 whitespace-nowrap">
                    {percentBox(s.increase, (typed) => setColumn(s.id, Number(typed)))} %
                    {removeButton(s)}
                  </th>
                ))}
                <th className="py-1 align-middle">{addButton}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => {
                // Only this grade changes, so a mistaken switch to High keeps the Primary figures.
                const setGrade = (change: { lastFee?: number; learners?: number }) => update({ grades: [...plan.grades.filter((r) => r.grade !== g.grade), { ...g, ...change }] });
                const saveGrades = () => saveIfChanged("grades");
                return (
                  <tr key={g.grade} className="border-t border-gray-50 align-top">
                    <td className="pr-4 py-1.5 whitespace-nowrap">{t("Grade {grade}", { grade: g.grade })}</td>
                    <td className="pr-4 py-1.5">{numberBox(g.lastFee, (lastFee) => setGrade({ lastFee }), saveGrades, t("Last year's fee for the year"))}</td>
                    <td className="pr-4 py-1.5">{numberBox(g.learners, (learners) => setGrade({ learners }), saveGrades, t("Learners"), "w-20")}</td>
                    {plan.scenarios.map((s) => {
                      const increase = gradeIncrease(s, g.grade);
                      const fee = feeAfter({ ...plan, lastFee: g.lastFee }, increase);
                      return (
                        <td key={s.id} className="pr-4 py-1.5 whitespace-nowrap">
                          {percentBox(increase, (typed) => setGradeIncrease(s, g.grade, typed))} %
                          {!!g.lastFee && (
                            <span className="block text-xs text-gray-500 mt-0.5">
                              {rands(fee)} · {rands(fee / months)} {t("Per month").toLowerCase()} · {signed((fee - g.lastFee) / months)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td />
                  </tr>
                );
              })}
              <tr className="border-t border-gray-200 font-semibold">
                <td className="pr-4 py-2">{t("Fee income")}</td>
                <td />
                <td className="pr-4 py-2">{rows.reduce((n, g) => n + g.learners, 0)}</td>
                {plan.scenarios.map((s) => (
                  <td key={s.id} className={`pr-4 py-2 whitespace-nowrap ${inBudget(s) ? "bg-emerald-50" : ""}`}>
                    {rands(feeIncome(plan, s))}
                    <span className="block font-normal">{useButton(s, t("Fees per grade, {learners} learners", { learners: rows.reduce((n, g) => n + g.learners, 0) }))}</span>
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        ) : (
          <>
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="text-left pr-6 py-1 font-medium text-gray-500">{t("Increase")}</th>
                  <th className="text-right pr-6 py-1 font-medium text-gray-500">{t("Fee for the year")}</th>
                  <th className="text-right pr-6 py-1 font-medium text-gray-500">{t("Per month")}</th>
                  <th className="text-right pr-6 py-1 font-medium text-gray-500">{t("More per month")}</th>
                  <th className="text-right pr-6 py-1 font-medium text-gray-500">{t("Fee income")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plan.scenarios.map((s) => {
                  const fee = feeAfter(plan, s.increase);
                  return (
                    <tr key={s.id} className={inBudget(s) ? "bg-emerald-50" : ""}>
                      <td className="pr-6 py-1 whitespace-nowrap">
                        {percentBox(s.increase, (typed) => setColumn(s.id, Number(typed)))} %
                        {removeButton(s)}
                      </td>
                      <td className="pr-6 py-1 text-right">{rands(fee)}</td>
                      <td className="pr-6 py-1 text-right">{rands(fee / months)}</td>
                      <td className="pr-6 py-1 text-right">{rands((fee - plan.lastFee) / months)}</td>
                      <td className="pr-6 py-1 text-right">{rands(feeIncome(plan, s))}</td>
                      <td className="py-1">{useButton(s, t("{fee} a year × {learners} learners ({increase}% increase)", { fee: rands(fee), learners: plan.learners, increase: s.increase }))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-2">{addButton}</div>
          </>
        )}
      </div>
      {perGrade && <p className="text-xs text-gray-400 mt-2">{t("The percentage at the top of a column fills every grade. Change a grade's own box to give it a different increase.")}</p>}
    </div>
  );
}
