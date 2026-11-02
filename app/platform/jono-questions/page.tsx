import Link from "next/link";
import { NextResponse } from "next/server";
import PlatformSignedOut from "@/components/PlatformSignedOut";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { listPlatformQuestions, KEEP_MONTHS } from "@/lib/jonoQuestions";

// Carl: "keep it in a portal only i can see, the questions that are asked so we
// can review them once a month, update our library so that as time goes on
// more questions become free". Only "how do I..." questions the guide could
// not answer are here (lib/jonoQuestions.ts). Each one answered well belongs
// in NEWER_THAN_GUIDE (lib/jonoHowTo.ts) or a Guide chapter.

export const dynamic = "force-dynamic";

export default async function JonoQuestionsPage() {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return <PlatformSignedOut />;
  const months = await listPlatformQuestions().catch(() => []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-dark text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Jono questions to add to the guide</h1>
            <p className="text-xs text-white/60">Platform administration</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-white/60">
            <Link href="/platform" className="underline hover:text-white">All schools</Link>
            <span>{admin.email}</span>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <p className="text-sm text-gray-600">
          &quot;How do I...&quot; questions Jono could not answer from the portal guide, from every school. Add the common ones to the guide
          and the same question becomes free. Kept {KEEP_MONTHS} months, with the school and date but no names. &quot;Missed&quot; means the
          free answer was wrong and the person asked the AI instead.
        </p>
        {months.length === 0 && <p className="text-sm text-gray-400">No questions yet.</p>}
        {months.map(({ month, items }) => (
          <section key={month} className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <h2 className="px-5 py-3 border-b border-gray-100 font-semibold text-dark">
              {new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-ZA", { month: "long", year: "numeric" })} · {items.length}
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {items.map((q, i) => (
                  <tr key={i} className="border-b border-gray-50 align-top">
                    <td className="px-5 py-2 text-gray-400 whitespace-nowrap">{q.at.slice(0, 10)}</td>
                    <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{q.school}</td>
                    <td className="px-2 py-2 text-dark">{q.question}</td>
                    <td className="px-2 py-2 text-gray-400">{q.locale}</td>
                    <td className="px-5 py-2">
                      {q.outcome === "missed" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Missed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </main>
    </div>
  );
}
