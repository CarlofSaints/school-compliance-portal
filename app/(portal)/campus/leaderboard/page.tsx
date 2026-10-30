"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";

interface Row {
  userId: string;
  name: string;
  rank: number;
  points: number;
  testsPassed: number;
  testsTaken: number;
  modulesCompleted: number;
  averagePct: number | null;
  lastActivity: string | null;
}
interface Board { rows: Row[]; me: string; publishedTests: number; publishedModules: number }

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const t = useT();
  const { session, loading } = useAuth();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    (async () => {
      const res = await authFetch("/api/training/leaderboard");
      if (res.ok) setBoard(await res.json());
      else setError(t("The leaderboard could not be loaded. Try again."));
    })();
  }, [session, t]);

  if (loading || (!board && !error)) return <div className="p-6">{t("Loading...")}</div>;
  if (!board) return <div className="p-6 text-sm text-gray-700">{error}</div>;

  return (
    <div>
      <Link href="/campus" className="text-sm text-primary">&larr; {t("Back to Campus")}</Link>
      <h1 className="text-2xl font-bold text-dark mt-3">{t("Campus leaderboard")}</h1>
      <p className="text-gray-500 text-sm mt-1 mb-6">
        {t("Everybody in the portal and their scores. Each published test is worth up to 100 points: your best score on it counts.")}{" "}
        {t("{tests} tests and {modules} modules published.", { tests: board.publishedTests, modules: board.publishedModules })}
      </p>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="px-4 py-3 w-16">{t("Place")}</th>
              <th className="px-4 py-3">{t("Name")}</th>
              <th className="px-4 py-3 text-right">{t("Points")}</th>
              <th className="px-4 py-3 text-right">{t("Tests passed")}</th>
              <th className="px-4 py-3 text-right">{t("Modules completed")}</th>
              <th className="px-4 py-3 text-right">{t("Average score")}</th>
              <th className="px-4 py-3 text-right">{t("Last activity")}</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((r) => (
              <tr key={r.userId} className={`border-b border-gray-50 last:border-0 ${r.userId === board.me ? "bg-primary/5 font-medium" : ""}`}>
                <td className="px-4 py-3">{r.points > 0 && r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</td>
                <td className="px-4 py-3">
                  {r.name}
                  {r.userId === board.me && <span className="text-xs text-primary ml-2">{t("(you)")}</span>}
                </td>
                <td className="px-4 py-3 text-right font-semibold">{r.points}</td>
                <td className="px-4 py-3 text-right">
                  {r.testsPassed} / {board.publishedTests}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.modulesCompleted} / {board.publishedModules}
                </td>
                <td className="px-4 py-3 text-right">{r.averagePct === null ? "-" : `${r.averagePct}%`}</td>
                <td className="px-4 py-3 text-right text-gray-500">
                  {r.lastActivity ? new Date(r.lastActivity).toLocaleDateString() : t("Not started")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
