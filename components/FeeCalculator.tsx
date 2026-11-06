"use client";

import { useState } from "react";
import { useT } from "@/components/I18nProvider";
import { emptyFeePlan, feeAfter, feeIncome, feeLineIn, gradeIncrease, gradeRows, lineAmount, rands, type BudgetLine, type FeePlan, type FeeScenario, type SchoolPhase } from "@/lib/budget";

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
  onUse: (line: BudgetLine, amount: number, note: string, plan: FeePlan) => void;
}) {
  const t = useT();
  const [plan, setPlan] = useState<FeePlan>({ ...emptyFeePlan(centre), ...stored });
  const [changingLine, setChangingLine] = useState(false);
  const update = (change: Partial<FeePlan>) => setPlan((p) => ({ ...p, ...change }));
  const commit = (change: Partial<FeePlan>) => {
    update(change);
    onSave(change);
  };

  const feeLine = lines.find((l) => l.id === plan.feeLineId) ?? feeLineIn(lines);
  const months = Math.max(1, plan.months);
  const perGrade = plan.mode === "grades";
  const rows = gradeRows(plan);
  const ready = perGrade ? rows.some((g) => g.lastFee && g.learners) : !!plan.lastFee && !!plan.learners;
  const inBudget = (s: FeeScenario) => ready && s.id === plan.chosenId && !!feeLine && lineAmount(feeLine) === feeIncome(plan, s);

  const setScenarios = (scenarios: FeeScenario[]) => update({ scenarios });
  const addScenario = () => {
    const top = Math.max(0, ...plan.scenarios.map((s) => s.increase));
    commit({ scenarios: [...plan.scenarios, { id: newId(), increase: top + 1 }] });
  };
  const removeScenario = (id: string) => commit({ scenarios: plan.scenarios.filter((s) => s.id !== id) });

  const numberBox = (value: number, onChange: (n: number) => void, onBlur: () => void, label: string, width = "w-28") => (
    <input type="number" aria-label={label} disabled={!editable} value={value || ""} onChange={(e) => onChange(Number(e.target.value))} onBlur={onBlur} className={`${INPUT} ${width}`} />
  );
  const field = (key: "lastFee" | "months" | "roundTo" | "learners", label: string) => (
    <label className="text-sm">
      <span className="block text-gray-600 mb-1">{label}</span>
      {numberBox(plan[key], (n) => update({ [key]: n }), () => onSave({ [key]: plan[key] }), label, "w-36")}
    </label>
  );
  const useButton = (s: FeeScenario, note: string) =>
    inBudget(s) ? (
      <span className="text-xs font-medium text-emerald-700">{t("In the budget")}</span>
    ) : (
      editable &&
      feeLine && (
        <button disabled={!ready} onClick={() => onUse(feeLine, feeIncome(plan, s), note, { ...plan, chosenId: s.id, feeLineId: feeLine.id })} className="text-primary text-xs font-medium disabled:opacity-40">
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
                    {numberBox(s.increase, (n) => setScenarios(plan.scenarios.map((x) => (x.id === s.id ? { ...x, increase: n } : x))), () => onSave({ scenarios: plan.scenarios }), t("Increase"), "w-16")} %
                    {removeButton(s)}
                  </th>
                ))}
                <th className="py-1 align-middle">{addButton}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => {
                const setGrade = (change: { lastFee?: number; learners?: number }) => update({ grades: rows.map((r) => (r.grade === g.grade ? { ...r, ...change } : r)) });
                const saveGrades = () => onSave({ grades: rows });
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
                          {numberBox(increase, (n) => setScenarios(plan.scenarios.map((x) => (x.id === s.id ? { ...x, byGrade: { ...x.byGrade, [g.grade]: n } } : x))), () => onSave({ scenarios: plan.scenarios }), t("Increase"), "w-16")} %
                          {!!g.lastFee && (
                            <span className="block text-xs text-gray-500 mt-0.5">
                              {rands(fee)} · {rands(fee / months)} {t("Per month").toLowerCase()} · +{rands((fee - g.lastFee) / months)}
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
                        {numberBox(s.increase, (n) => setScenarios(plan.scenarios.map((x) => (x.id === s.id ? { ...x, increase: n } : x))), () => onSave({ scenarios: plan.scenarios }), t("Increase"), "w-16")} %
                        {removeButton(s)}
                      </td>
                      <td className="pr-6 py-1 text-right">{rands(fee)}</td>
                      <td className="pr-6 py-1 text-right">{rands(fee / months)}</td>
                      <td className="pr-6 py-1 text-right">{rands((fee - plan.lastFee) / months)}</td>
                      <td className="pr-6 py-1 text-right">{rands(fee * plan.learners)}</td>
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
