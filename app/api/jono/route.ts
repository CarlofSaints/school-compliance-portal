import { NextRequest, NextResponse } from "next/server";
import { isAiOutOfCredit } from "@/lib/aiErrors";
import { requireLogin } from "@/lib/rolesData";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { JonoError, askJono, cleanTurns, jonoRequest, countJonoTokens, JONO_MAX_OUTPUT } from "@/lib/askJono";
import { getLocale } from "@/lib/i18n/server";
import { freeHowTo } from "@/lib/jonoFree";
import { keepJonoQuestion } from "@/lib/jonoQuestions";
import { resolveBranding } from "@/lib/brandingData";
import { after } from "next/server";
import { jonoCharging, quoteCredits, creditsForUsd, usdCost, tenth } from "@/lib/jonoBilling";
import { getCredits, spendCredits, addCredits, maySpendCredits } from "@/lib/contentTranslation";

export const maxDuration = 120;

// Ask Jono. Any signed-in person may ask; what Jono can see is limited to what
// they may see (lib/askJono.ts).
//
// Carl: free when it can answer without the AI; otherwise say it needs credits
// first, and say so plainly when there are none.
//   1. A "how do I..." the Guide answers -> free, no AI (lib/jonoFree.ts).
//   2. Before JONO_CHARGING_FROM -> the AI answers free, as it always has.
//   3. From then: without {accepted}, reply with the quote (needsCredits) -
//      no AI runs, nothing counted. With {accepted: n}: only if today's quote
//      is not above n, take it, ask, then give back everything above the
//      ACTUAL cost (lib/jonoBilling.ts). A failed answer gives it all back.
export async function POST(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  // Checked before the limits, so a malformed call never uses up the school's questions.
  const turns = cleanTurns(body.messages);
  if (!turns) return NextResponse.json({ error: "Type a question first." }, { status: 400 });
  const locale = await getLocale();

  // 1. Free from the Guide (the latest question only; "Ask the AI instead" skips it).
  const question = String(turns[turns.length - 1].content);
  if (body.forceAi !== true) {
    const free = freeHowTo(question, locale);
    if (free) return NextResponse.json({ answer: free, free: true });
  }

  // A question about USING the portal that the guide missed - as Jono itself
  // judged it (portalQuestion), never a records or law question - is kept for
  // Carl's monthly review so the free library grows (lib/jonoQuestions.ts):
  // school + date + language, no name. After the reply, never slowing it.
  const keepIfPortal = (portalQuestion: boolean) => {
    if (!portalQuestion) return;
    const outcome = body.forceAi === true && body.accepted === undefined ? "missed" : "ai";
    after(async () => {
      const school = (await resolveBranding().catch(() => null))?.fullName ?? "Unknown school";
      await keepJonoQuestion({ at: new Date().toISOString(), school, locale, question: question.slice(0, 500), outcome });
    });
  };

  const buyUrl = session.permissions.includes("manage_users") ? "/admin/translation-credits" : "/billing";
  const accepted = typeof body.accepted === "number" && body.accepted > 0 ? body.accepted : null;
  let held = 0; // credits taken for this answer, given back if it fails
  try {
    const request = await jonoRequest(session, turns, locale);
    const charging = jonoCharging();

    if (charging) {
      // 3. Priced before it runs. Quoting runs no AI, so it is not rate limited.
      const quote = quoteCredits(await countJonoTokens(request), JONO_MAX_OUTPUT);
      const [balance, canSpend] = await Promise.all([getCredits(), maySpendCredits(session.id)]);
      // 🔴 Never above what the person agreed to: a higher quote asks again.
      if (accepted === null || quote > accepted || !canSpend || balance < quote) {
        return NextResponse.json({ needsCredits: true, quote, balance, canSpend, buyUrl });
      }
      // Only questions that really go to the AI count against the limits.
      const limited = await enforce([[LIMITS.jonoUser, session.id], [LIMITS.jonoSchool, "school"]]);
      if (limited) return limited;
      if (!(await spendCredits(quote))) {
        return NextResponse.json({ needsCredits: true, quote, balance: await getCredits(), canSpend, buyUrl });
      }
      held = quote;
      const { text, usage, portalQuestion } = await askJono(request);
      keepIfPortal(portalQuestion);
      const charged = Math.min(quote, creditsForUsd(usdCost(usage)));
      held = 0;
      // The difference back. The answer stands even if this hiccups.
      const back = tenth(quote - charged);
      let left: number | null = null;
      if (back > 0) {
        left = await addCredits(back).then((r) => r.balance).catch((e) => {
          console.error(`[jono] 🔴 REFUND FAILED: add ${back} credits back by hand.`, e);
          return null;
        });
      } else left = await getCredits().catch(() => null);
      return NextResponse.json({ answer: text, charged, balance: left });
    }

    // 2. Not charging yet: free, as it always has been.
    const limited = await enforce([[LIMITS.jonoUser, session.id], [LIMITS.jonoSchool, "school"]]);
    if (limited) return limited;
    const { text, portalQuestion } = await askJono(request);
    keepIfPortal(portalQuestion);
    return NextResponse.json({ answer: text });
  } catch (err) {
    if (held > 0) {
      await addCredits(held).catch((e) => console.error(`[jono] 🔴 REFUND FAILED: add ${held} credits back by hand.`, e));
    }
    if (err instanceof JonoError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("[jono] Failed:", err);
    // Said plainly, with the page to report it on: "try again" never helps here.
    if (isAiOutOfCredit(err)) {
      return NextResponse.json({ error: "out-of-ai-credit", code: "out-of-ai-credit" }, { status: 503 });
    }
    return NextResponse.json({ error: "Jono could not answer just now. Please try again." }, { status: 500 });
  }
}
