"use client";

import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import { CREDIT_PACK, MAX_PACKS, PAGES_PER_CREDIT, POLICY_AI_CREDITS } from "@/lib/creditPack";

// How the portal bills for AI, for everyone signed in. Every number on this
// page is read from lib/creditPack.ts, the same constants the charges use, so
// the page cannot say one price while the portal takes another.
// 🔴 The public site has the same page (School-compliance repo, /billing).
// Change both when a price or a paid feature changes.

const card = "bg-white rounded-xl shadow-sm border border-gray-100 p-6";
const h2 = "text-base font-semibold text-dark mb-3";

export default function BillingPage() {
  const t = useT();
  const { session, loading } = useAuth();
  if (loading) return <div className="p-6">{t("Loading...")}</div>;
  const isAdmin = !!session?.permissions.includes("manage_users");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark">{t("How billing works")}</h1>
        <p className="text-gray-500 text-sm">
          {t("Your subscription pays for the portal. A few AI features are paid for separately with credits. This page lists every one of them, so nothing comes as a surprise.")}
        </p>
      </div>

      <section className={card}>
        <h2 className={h2}>{t("What uses credits")}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="py-2 pr-4 font-medium">{t("Feature")}</th>
              <th className="py-2 font-medium">{t("Credits")}</th>
            </tr>
          </thead>
          <tbody className="text-gray-700 align-top">
            <tr className="border-b border-gray-50">
              <td className="py-2 pr-4">{t("Translating a policy or set of minutes into another language")}</td>
              <td className="py-2">{t("1 credit per {pages} pages, per language", { pages: PAGES_PER_CREDIT })}</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-2 pr-4">{t("Translating a Campus lesson or test written by someone at your school")}</td>
              <td className="py-2">{t("1 credit per {pages} pages, per language", { pages: PAGES_PER_CREDIT })}</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-2 pr-4">{t("Compile a policy: writing the draft")}</td>
              <td className="py-2">{t("{n} credits", { n: POLICY_AI_CREDITS.draft })}</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-2 pr-4">{t("Compile a policy: each change the AI makes, including \"Fix these in the draft\"")}</td>
              <td className="py-2">{t("{n} credits", { n: POLICY_AI_CREDITS.revise })}</td>
            </tr>
            <tr>
              <td className="py-2 pr-4">{t("Compile a policy: compliance check of the draft")}</td>
              <td className="py-2">{POLICY_AI_CREDITS.check === 1 ? t("{n} credit", { n: 1 }) : t("{n} credits", { n: POLICY_AI_CREDITS.check })}</td>
            </tr>
          </tbody>
        </table>
        <ul className="list-disc pl-5 mt-4 space-y-1.5 text-sm text-gray-700">
          <li>{t("A translation is priced before it runs. You see the number of credits and confirm it, and nothing is taken until you do.")}</li>
          <li>{t("Once a document is translated, anyone at your school can read it in that language for free. A new version of the document is a new translation.")}</li>
          <li>{t("On Compile a policy, every button shows its cost. Editing the text yourself and adding the policy to your library are free.")}</li>
        </ul>
      </section>

      <section className={card}>
        <h2 className={h2}>{t("Included in your subscription, no credits")}</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700">
          <li>{t("Compliance checks on the Compliance, Policies and Documents pages")}</li>
          <li>{t("Convert a scanned PDF policy to Word")}</li>
          <li>{t("Campus courses from the library or built with AI, in every language")}</li>
          <li>{t("Ask Jono")}</li>
          <li>{t("Switching the portal's own screens to another language")}</li>
        </ul>
        <p className="text-sm text-gray-500 mt-3">
          {t("If we ever start charging credits for one of these, this page changes first and your school's administrators are told by email before it starts.")}
        </p>
      </section>

      <section className={card}>
        <h2 className={h2}>{t("Buying credits")}</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700">
          <li>{t("R{rand} for {credits} credits. You can order up to {packs} packs at a time.", { rand: CREDIT_PACK.rand, credits: CREDIT_PACK.credits, packs: MAX_PACKS })}</li>
          <li>{t("An administrator orders under Admin > Translation Credits. We email an invoice, you pay it by EFT, and the credits are added once the payment comes in.")}</li>
          <li>{t("Credits never expire. They belong to the school, not to one person.")}</li>
          <li>{t("There are no automatic top-ups and no card on file. Credits are only ever added when your school orders and pays for them.")}</li>
        </ul>
        {isAdmin && (
          <Link href="/admin/translation-credits" className="inline-block mt-4 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            {t("Buy credits")}
          </Link>
        )}
      </section>

      <section className={card}>
        <h2 className={h2}>{t("Who can spend them")}</h2>
        <p className="text-sm text-gray-700">
          {t("Only people your administrator has ticked \"Can spend translation credits\" on Admin > Users can use a paid feature. Everyone else sees the buttons greyed out.")}
        </p>
      </section>

      <section className={card}>
        <h2 className={h2}>{t("No surprises")}</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700">
          <li>{t("You always see the cost before you click.")}</li>
          <li>{t("If the AI fails or returns nothing usable, the credits go straight back to your school.")}</li>
          <li>{t("When your school runs out, the paid feature simply does not run. There is no overdraft and no bill afterwards.")}</li>
          <li>{t("Your balance is shown on Admin > Translation Credits and on the Compile a policy page.")}</li>
        </ul>
        <p className="text-sm text-gray-500 mt-4">
          {t("A charge you think is wrong? Email {email} and we will look into it.", { email: "info@outerjoin.co.za" })}
        </p>
      </section>
    </div>
  );
}
