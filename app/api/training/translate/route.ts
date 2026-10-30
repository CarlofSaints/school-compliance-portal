import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { getLocale } from "@/lib/i18n/server";
import { getMaterial, getTest } from "@/lib/trainingData";
import { canManageTraining } from "@/lib/trainingAccess";
import { creditsFor, maySpendCredits, textPages, withCredits } from "@/lib/contentTranslation";
import { CampusTranslateError, claim, isFree, keyOf, release, saveTranslation, storedFor, translateUnits, translationsFor, unitOf } from "@/lib/campusTranslation";

// A long lesson takes a minute or two to translate.
export const maxDuration = 300;

// { kind: "material" | "test", id } -> a quote { credits } for translating a
// MANUAL lesson or test into the reader's language. Send again with
// confirm: true and the same credits to pay and translate. Once stored,
// everyone at the school reads it in that language for free.
// (AI and library content is translated for free by lib/campusTranslation.ts.)
export async function POST(req: NextRequest) {
  const deadline = Date.now() + 270_000;
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; id?: unknown; confirm?: unknown; credits?: unknown };
  if ((body.kind !== "material" && body.kind !== "test") || typeof body.id !== "string") {
    return NextResponse.json({ error: "kind and id are required" }, { status: 400 });
  }
  const kind = body.kind;
  const locale = await getLocale();
  if (locale === "en") return NextResponse.json({ error: "Pick a language other than English first." }, { status: 400 });

  const item = kind === "material" ? await getMaterial(body.id) : await getTest(body.id);
  // Same visibility as the learner pages: a draft is only there for the people who build training.
  if (!item || (item.status !== "published" && !canManageTraining(session))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (isFree(kind, item.source)) return NextResponse.json({ error: "This is translated for free. Open it again in a minute." }, { status: 409 });
  if (storedFor(await translationsFor(locale), kind, item)) return NextResponse.json({ ok: true, already: true });

  if (!(await maySpendCredits(session.id))) {
    return NextResponse.json(
      { error: "You are not allowed to spend translation credits. Ask your administrator to tick \"Can spend translation credits\" on your user." },
      { status: 403 }
    );
  }
  const unit = unitOf(kind, item);
  const credits = creditsFor(textPages(JSON.stringify(unit)));
  if (body.confirm !== true) return NextResponse.json({ quote: { credits } });
  // Never charge other than what was agreed: an edit between quote and click is priced again.
  if (body.credits !== credits) return NextResponse.json({ quote: { credits }, changed: true });

  const limited = await enforce([[LIMITS.translateUser, session.id]]);
  if (limited) return limited;
  const key = keyOf(kind, item.id);
  if (!(await claim(locale, key))) return NextResponse.json({ error: "This is being translated right now. Try again in a minute or two." }, { status: 409 });
  try {
    const paid = await withCredits(credits, async () => {
      const [out] = await translateUnits(locale, [unit], deadline);
      await saveTranslation(locale, kind, item, out, true);
      return out;
    });
    if (!paid.ok) return NextResponse.json({ error: "Your school does not have enough credits for this. Buy more under Admin > Translation Credits.", balance: paid.balance }, { status: 402 });
    return NextResponse.json({ ok: true, balance: paid.balance });
  } catch (err) {
    console.error("[campus translate] paid translation failed", kind, item.id, locale, err);
    return NextResponse.json(
      { error: err instanceof CampusTranslateError ? err.message : "The translation could not be done just now. Your credits were given back. Please try again." },
      { status: 502 }
    );
  } finally {
    await release(locale, key);
  }
}
