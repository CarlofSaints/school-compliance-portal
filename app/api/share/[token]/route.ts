import { NextRequest, NextResponse } from "next/server";
import { LIMITS, enforce, ipOf } from "@/lib/rateLimit";
import { isHttps } from "@/lib/session";
import { guestCookieValue, guestFromRequest, guestLearner, joinGuest, setGuestCookie, usableLink } from "@/lib/campusShare";
import { getMaterials, getModules, getProgress, getTests } from "@/lib/trainingData";
import { emptyProgress, isLocked, itemDone, liveKeys, readingMinutes } from "@/lib/training";
import { resolveBranding } from "@/lib/brandingData";
import { inReaderLanguageLists } from "@/lib/campusTranslation";

export const maxDuration = 300;

export const dynamic = "force-dynamic";
const gone = () => NextResponse.json({ error: "This link has expired or been switched off." }, { status: 404 });

// What a share link opens, and (once the visitor has given their name) how far
// they have got. Public: no portal sign-in.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await usableLink(token);
  if (!link) return gone();
  const [guest, english, branding] = await Promise.all([
    guestFromRequest(req, token),
    Promise.all([getMaterials(), getTests(), getModules()]),
    resolveBranding(),
  ]);
  // Only what this link covers is translated: a public link must not set off translation of the whole Campus.
  const covered = new Set<string>(
    link.kind === "module"
      ? [`module:${link.targetId}`, ...(english[2].find((m) => m.id === link.targetId)?.items ?? []).map((i) => `${i.kind}:${i.id}`)]
      : [`${link.kind}:${link.targetId}`]
  );
  const { materials, tests, modules } = await inReaderLanguageLists({
    materials: english[0].filter((m) => covered.has(`material:${m.id}`)),
    tests: english[1].filter((t) => covered.has(`test:${t.id}`)),
    modules: english[2].filter((m) => covered.has(`module:${m.id}`)),
  });
  const progress = guest ? await getProgress((await guestLearner(link, guest)).progressId) : emptyProgress("none");
  const live = liveKeys(materials, tests);
  const describe = (kind: "material" | "test", id: string) => {
    const m = kind === "material" ? materials.find((x) => x.id === id) : undefined;
    const t = kind === "test" ? tests.find((x) => x.id === id) : undefined;
    const it = m ?? t;
    if (!it || it.status !== "published") return null;
    return {
      kind,
      id,
      title: it.title,
      icon: m?.icon ?? (kind === "test" ? "📝" : "📖"),
      minutes: m ? readingMinutes(m) : t?.timeLimitMinutes || null,
      done: itemDone(progress, { kind, id }),
      // Only the link's own module's order applies to a guest.
      locked: link.kind === "module" && isLocked(progress, modules.filter((m) => m.id === link.targetId), { kind, id }, live),
    };
  };

  let title: string;
  let description = "";
  let icon = "🎓";
  let colour = "violet";
  let items;
  if (link.kind === "module") {
    const mod = modules.find((m) => m.id === link.targetId && m.status === "published");
    if (!mod) return gone();
    ({ title, description } = mod);
    icon = mod.icon || icon;
    colour = mod.colour || colour;
    items = mod.items.map((i) => describe(i.kind, i.id)).filter((x) => x !== null);
  } else {
    const one = describe(link.kind, link.targetId);
    if (!one) return gone();
    title = one.title;
    items = [{ ...one, locked: false }];
  }
  return NextResponse.json(
    { school: branding.fullName, title, description, icon, colour, items, guest: guest && { name: guest.name, surname: guest.surname } },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// { name, surname, email }: who is doing the training. Self-declared, checked against nothing.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const limited = await enforce([[LIMITS.campusGuestIp, ipOf(req)]]);
  if (limited) return limited;
  const link = await usableLink(token);
  if (!link) return gone();
  const body = await req.json().catch(() => ({}));
  const field = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = field(body.name, 80);
  const surname = field(body.surname, 80);
  const email = field(body.email, 200).toLowerCase();
  if (!name || !surname || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Give your name, surname and email address." }, { status: 400 });
  }
  const guest = await joinGuest(token, name, surname, email);
  const res = NextResponse.json({ ok: true });
  setGuestCookie(res, token, await guestCookieValue(token, guest.id), isHttps(req));
  return res;
}
