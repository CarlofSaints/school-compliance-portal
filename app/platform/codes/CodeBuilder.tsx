"use client";

import { useMemo, useState } from "react";
import {
  valueOfCode,
  suggestCode,
  normaliseCode,
  type PlatformCode,
} from "@/lib/codes";

// List prices, so the preview can show what a school would actually pay.
// ⚠️ These mirror PLANS in the MARKETING repo, which is where PayFast is
// signed. They are here only to show Carl a number while he builds a code; the
// amount a school is charged is always computed there, never here.
const LIST = { monthly: "1750.00", annual: "15000.00" };

const rand = (v: string | number) =>
  "R" +
  Number(v)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

type Span = "first" | "forever";
type DiscountKind = "percent" | "amount";

export default function CodeBuilder({
  initialCodes,
  schools,
}: {
  initialCodes: PlatformCode[];
  schools: { key: string; name: string }[];
}) {
  const [codes, setCodes] = useState(initialCodes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const [code, setCode] = useState(() => suggestCode());
  const [label, setLabel] = useState("");
  const [appliesTo, setAppliesTo] = useState<"new_school" | "existing_school">(
    "new_school"
  );
  const [targetSchoolKey, setTargetSchoolKey] = useState("");
  const [discountKind, setDiscountKind] = useState<DiscountKind>("percent");
  const [span, setSpan] = useState<Span>("first");
  const [pctMonthly, setPctMonthly] = useState("25");
  const [pctAnnual, setPctAnnual] = useState("25");
  const [amtMonthly, setAmtMonthly] = useState("250");
  const [amtAnnual, setAmtAnnual] = useState("2000");
  const [expiresOn, setExpiresOn] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");

  // 🔴 The preview is the whole point of the screen. Carl is deciding what a
  // discount is worth, and "25%" means nothing until you see R1,312.50 next to
  // it, and see that the RENEWAL goes back to R1,750.
  const preview = useMemo(() => {
    const draft = {
      percentOff:
        discountKind === "percent"
          ? { monthly: Number(pctMonthly) || 0, annual: Number(pctAnnual) || 0 }
          : null,
      amountOff:
        discountKind === "amount"
          ? { monthly: Number(amtMonthly) || 0, annual: Number(amtAnnual) || 0 }
          : null,
      billingCycles: span === "forever" ? null : 1,
    };
    return {
      monthly: valueOfCode(draft, "monthly", LIST.monthly),
      annual: valueOfCode(draft, "annual", LIST.annual),
    };
  }, [discountKind, span, pctMonthly, pctAnnual, amtMonthly, amtAnnual]);

  async function create() {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await fetch("/api/platform/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          label,
          kind: "promo",
          appliesTo,
          targetSchoolKey,
          discountKind,
          percentOff: { monthly: Number(pctMonthly), annual: Number(pctAnnual) },
          amountOff: { monthly: Number(amtMonthly), annual: Number(amtAnnual) },
          span: span === "forever" ? "forever" : "first",
          expiresOn,
          maxRedemptions: maxRedemptions === "" ? null : Number(maxRedemptions),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create that code.");
        return;
      }
      setCodes((c) => [data.code, ...c]);
      setDone(`${data.code.code} created.`);
      setCode(suggestCode());
      setLabel("");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(target: string) {
    const res = await fetch(`/api/platform/codes/${encodeURIComponent(target)}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    const data = await res.json();
    setCodes((c) => c.map((x) => (x.code === target ? data.code : x)));
  }

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* --- Builder --- */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-gray-900">New code</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className={labelCls}>Code</label>
            <div className="flex gap-2">
              <input
                className={`${field} font-mono uppercase`}
                value={code}
                onChange={(e) => setCode(normaliseCode(e.target.value))}
              />
              <button
                type="button"
                onClick={() => setCode(suggestCode())}
                className="whitespace-nowrap rounded-lg border border-gray-300 px-3 text-xs font-medium hover:bg-gray-50"
              >
                Suggest
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Suggestions leave out O, 0, I, 1 and L, which get misread off a
              printed page or a WhatsApp.
            </p>
          </div>

          <div>
            <label className={labelCls}>What is it for? (your own note)</label>
            <input
              className={field}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Launch offer, GDE district day"
            />
          </div>

          <div>
            <label className={labelCls}>Who can use it</label>
            <select
              className={field}
              value={appliesTo}
              onChange={(e) =>
                setAppliesTo(e.target.value as "new_school" | "existing_school")
              }
            >
              <option value="new_school">Any new school, at signup</option>
              <option value="existing_school">One school I name</option>
            </select>
          </div>

          {appliesTo === "existing_school" && (
            <div>
              <label className={labelCls}>Which school</label>
              <select
                className={field}
                value={targetSchoolKey}
                onChange={(e) => setTargetSchoolKey(e.target.value)}
              >
                <option value="">Choose a school</option>
                {schools.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Take off</label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["percent", "A percentage"],
                  ["amount", "A rand amount"],
                ] as [DiscountKind, string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDiscountKind(k)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                    discountKind === k
                      ? "border-dark bg-dark text-white"
                      : "border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                Monthly plan {discountKind === "percent" ? "(%)" : "(R)"}
              </label>
              <input
                type="number"
                min="0"
                className={field}
                value={discountKind === "percent" ? pctMonthly : amtMonthly}
                onChange={(e) =>
                  discountKind === "percent"
                    ? setPctMonthly(e.target.value)
                    : setAmtMonthly(e.target.value)
                }
              />
            </div>
            <div>
              <label className={labelCls}>
                Annual plan {discountKind === "percent" ? "(%)" : "(R)"}
              </label>
              <input
                type="number"
                min="0"
                className={field}
                value={discountKind === "percent" ? pctAnnual : amtAnnual}
                onChange={(e) =>
                  discountKind === "percent"
                    ? setPctAnnual(e.target.value)
                    : setAmtAnnual(e.target.value)
                }
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Set one of them to zero if the code should only work on the other
            plan.
          </p>

          <div>
            <label className={labelCls}>For how long</label>
            <div className="space-y-2">
              {(
                [
                  ["first", "The first payment only, then full price"],
                  ["forever", "Every payment, for as long as they stay"],
                ] as [Span, string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSpan(k)}
                  className={`block w-full rounded-lg border px-3 py-2 text-left text-xs font-medium ${
                    span === k
                      ? "border-dark bg-dark text-white"
                      : "border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {/* Said here rather than left to be discovered: a school on a
                "forever" code is a permanently cheaper school. */}
            <p className="mt-1 text-xs text-gray-500">
              {span === "forever"
                ? "This school pays the reduced price on every renewal, indefinitely."
                : "Renewals go back to the standard price."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Expires (optional)</label>
              <input
                type="date"
                className={field}
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Max uses (optional)</label>
              <input
                type="number"
                min="1"
                className={field}
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
          {done && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
              {done}
            </p>
          )}

          <button
            onClick={create}
            disabled={busy || code.length < 4}
            className="w-full rounded-lg bg-dark px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Creating..." : "Create code"}
          </button>
        </div>
      </div>

      {/* --- Preview + list --- */}
      <div className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-bold text-gray-900">
            What a school would pay
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {(
              [
                ["Monthly", preview.monthly, LIST.monthly],
                ["Annual", preview.annual, LIST.annual],
              ] as const
            ).map(([name, v, list]) => (
              <div key={name} className="rounded-lg bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {name}
                </p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {rand(v.firstAmount)}
                  {v.discounted && (
                    <span className="ml-2 text-sm font-normal text-gray-400 line-through">
                      {rand(list)}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  then {rand(v.recurringAmount)} on every renewal
                </p>
                <p className="mt-2 text-xs text-gray-500">{v.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-3">
            <h2 className="text-sm font-bold text-gray-900">
              Codes ({codes.length})
            </h2>
          </div>
          {codes.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-500">
              No codes yet. Build one on the left.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Worth</th>
                    <th className="px-3 py-2 font-medium">For</th>
                    <th className="px-3 py-2 font-medium">Used</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => {
                    const v = valueOfCode(c, "monthly", LIST.monthly);
                    const dead = !!c.revokedAt;
                    return (
                      <tr
                        key={c.code}
                        className={`border-b border-gray-100 ${dead ? "opacity-50" : ""}`}
                      >
                        <td className="px-5 py-3">
                          <span className="font-mono font-semibold text-gray-900">
                            {c.code}
                          </span>
                          {dead && (
                            <span className="ml-2 text-xs text-gray-500">revoked</span>
                          )}
                          {c.label && (
                            <p className="text-xs text-gray-500">{c.label}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-700">{v.description}</td>
                        <td className="px-3 py-3 text-gray-700">
                          {c.appliesTo === "new_school"
                            ? "New schools"
                            : schools.find((s) => s.key === c.targetSchoolKey)?.name ||
                              c.targetSchoolKey}
                          {c.expiresOn && (
                            <p className="text-xs text-gray-500">
                              until {c.expiresOn}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {c.redemptions.length}
                          {c.maxRedemptions !== null && ` / ${c.maxRedemptions}`}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {!dead && (
                            <button
                              onClick={() => revoke(c.code)}
                              className="text-xs font-medium text-red-600 hover:underline"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
