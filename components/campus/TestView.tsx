"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/components/I18nProvider";
import { CopyLinkButton, DraftPill } from "@/components/trainingUi";
import TranslationBanner, { type CampusTranslation } from "@/components/campus/TranslationBanner";

interface Paper {
  id: string;
  title: string;
  description: string;
  status: string;
  passMark: number;
  maxAttempts: number;
  questions: { id: string; type: "single" | "multi" | "truefalse" | "text"; text: string; points: number; options: { id: string; text: string }[] }[];
  attempts: { id: string; submittedAt: string; scorePct: number; passed: boolean }[];
  timeLimitMinutes?: number;
  /** When this timed sitting ends (ISO), or null. */
  deadline: string | null;
  translation?: CampusTranslation;
}
interface Result {
  scorePct: number;
  passed: boolean;
  pointsAwarded: number;
  pointsPossible: number;
  passMark: number;
  answersShown: boolean;
  timedOut: boolean;
  memo: { questionId: string; isCorrect: boolean; correctOptionIds: string[]; acceptedAnswers: string[]; explanation: string }[] | null;
}

export interface TestResult {
  passed: boolean;
}

/**
 * A test paper, for a portal user (api "/api/training") or a share-link guest
 * (api "/api/share/<token>"). Marking and the memo rule are on the server.
 */
export default function TestView(props: {
  id: string;
  api: string;
  fetcher: (url: string, init?: RequestInit) => Promise<Response>;
  ready: boolean;
  backHref: string;
  backLabel: string;
  /** Where "Next step" goes after a pass; the back link when there is none. */
  nextHref: string;
  onResult?: (r: TestResult | null) => void;
  copyPath?: string;
  editHref?: string;
  leaderboardHref?: string;
}) {
  const t = useT();
  const { id, api, fetcher, ready } = props;
  const [now, setNow] = useState(() => Date.now());
  const [paper, setPaper] = useState<Paper | null>(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nextHref = props.nextHref;
  useEffect(() => {
    props.onResult?.(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const load = useCallback(async () => {
    const res = await fetcher(`${api}/tests/${id}`);
    const body = await res.json().catch(() => ({}));
    if (res.ok) setPaper(body);
    else setError(body.error || t("This test could not be opened."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, api, t]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const submit = async (auto = false) => {
    if (!paper || submitting) return;
    const blank = paper.questions.filter((q) => {
      const a = answers[q.id];
      return a === undefined || (Array.isArray(a) ? a.length === 0 : !a.trim());
    }).length;
    if (!auto && blank && !confirm(t("{count} questions are not answered. Hand in anyway?", { count: blank }))) return;
    setSubmitting(true);
    setError("");
    const res = await fetcher(`${api}/tests/${id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responses: answers }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setResult(body);
      window.scrollTo({ top: 0 });
      load();
    } else setError(body.error || t("Your answers could not be handed in. Try again."));
    setSubmitting(false);
  };

  // The clock for a timed paper. At zero the paper is handed in as it stands.
  const deadline = !result && paper?.deadline ? Date.parse(paper.deadline) : null;
  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  const secondsLeft = deadline === null ? null : Math.max(0, Math.round((deadline - now) / 1000));
  useEffect(() => {
    if (secondsLeft === 0) submit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  const retake = () => {
    setResult(null);
    setAnswers({});
    window.scrollTo({ top: 0 });
    // A new sitting: a timed paper starts a new clock when it is opened again.
    load();
  };

  if (!paper && !error) return <div className="p-6">{t("Loading...")}</div>;
  if (!paper) {
    return (
      <div className="max-w-3xl">
        <Link href={props.backHref} className="text-sm text-primary">&larr; {props.backLabel}</Link>
        <p className="mt-4 text-sm text-gray-700">{error}</p>
      </div>
    );
  }

  const used = paper.attempts.length;
  const left = paper.maxAttempts > 0 ? paper.maxAttempts - used : null;
  const best = used ? Math.max(...paper.attempts.map((a) => a.scorePct)) : null;
  const memoFor = (qid: string) => result?.memo?.find((m) => m.questionId === qid);

  return (
    <div className="max-w-3xl">
      <Link href={props.backHref} className="text-sm text-primary">&larr; {props.backLabel}</Link>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-3">
        <h1 className="text-2xl font-bold text-dark">
          {paper.title}
          {paper.status !== "published" && <DraftPill />}
        </h1>
        {paper.description && <p className="text-gray-500 text-sm mt-1">{paper.description}</p>}
        {/* Answers are kept by question id, so a paper translated mid-sitting keeps what was already ticked. */}
        <TranslationBanner kind="test" id={paper.id} translation={paper.translation} guest={api.startsWith("/api/share")} onTranslated={load} />
        <p className="text-xs text-gray-400 mt-2">
          {t("{count} questions", { count: paper.questions.length })} &middot; {t("Pass mark {pct}%", { pct: paper.passMark })}
          {left !== null && <> &middot; {t("{left} of {max} attempts left", { left: Math.max(0, left), max: paper.maxAttempts })}</>}
          {best !== null && <> &middot; {t("Your best: {pct}%", { pct: best })}</>}
          {paper.timeLimitMinutes ? <> &middot; ⏱ {t("{n} minutes allowed", { n: paper.timeLimitMinutes })}</> : null}
        </p>
        <div className="flex gap-2 mt-3">
          {props.copyPath && <CopyLinkButton path={props.copyPath} />}
          {props.editHref && (
            <Link href={props.editHref} className="border border-gray-200 bg-white text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50">
              ✏️ {t("Edit")}
            </Link>
          )}
        </div>
      </div>

      {secondsLeft !== null && (
        <div className={`sticky top-2 z-10 mt-4 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm border ${secondsLeft < 60 ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-gray-200 text-dark"}`}>
          ⏱ {t("Time left: {time}", { time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` })}
        </div>
      )}

      {result && (
        <div className={`rounded-xl p-6 mt-4 border ${result.passed ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
          <p className="text-3xl font-bold text-dark">{result.scorePct}%</p>
          <p className="text-sm mt-1">
            {result.passed ? t("Passed. Well done.") : t("Not passed. The pass mark is {pct}%.", { pct: result.passMark })}{" "}
            {t("{got} of {total} points.", { got: result.pointsAwarded, total: result.pointsPossible })}
          </p>
          {result.timedOut && <p className="text-xs text-red-700 mt-2">{t("The time ran out before this paper was handed in, so it was marked as blank.")}</p>}
          {result.memo && !result.answersShown && (
            <p className="text-xs text-gray-600 mt-2">{t("The questions you got wrong are marked in red. The right answers are shown once you pass.")}</p>
          )}
          <div className="flex gap-2 mt-4">
            {(left === null || left > 0) && (
              <button onClick={retake} className="border border-gray-300 bg-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                {t("Try again")}
              </button>
            )}
            {props.leaderboardHref && (
              <Link href={props.leaderboardHref} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium">
                {t("See the leaderboard")}
              </Link>
            )}
            {result.passed && nextHref !== props.backHref && (
              <Link href={nextHref} className="border border-gray-300 bg-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                {t("Next step")} &rarr;
              </Link>
            )}
          </div>
        </div>
      )}

      {!result && left !== null && left <= 0 ? (
        <p className="mt-4 text-sm text-gray-700 bg-white rounded-xl border border-gray-100 p-6">{t("You have used all your attempts at this test.")}</p>
      ) : (
        <div className="space-y-4 mt-4">
          {paper.questions.map((q, i) => {
            const memo = memoFor(q.id);
            const value = answers[q.id];
            const set = (v: string | string[]) => !result && setAnswers((a) => ({ ...a, [q.id]: v }));
            return (
              <div
                key={q.id}
                className={`bg-white rounded-xl shadow-sm border p-5 ${memo ? (memo.isCorrect ? "border-emerald-300" : "border-red-300") : "border-gray-100"}`}
              >
                <p className="text-sm font-medium text-dark">
                  {i + 1}. {q.text}
                  {q.type === "multi" && <span className="text-xs text-gray-400 font-normal"> ({t("tick all that apply")})</span>}
                </p>
                {q.type === "text" ? (
                  <input
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) => set(e.target.value)}
                    disabled={Boolean(result)}
                    className="mt-3 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder={t("Type your answer")}
                  />
                ) : (
                  <div className="mt-3 space-y-2">
                    {q.options.map((o) => {
                      const multi = q.type === "multi";
                      const chosen = multi ? Array.isArray(value) && value.includes(o.id) : value === o.id;
                      const right = memo?.correctOptionIds.includes(o.id);
                      return (
                        <label
                          key={o.id}
                          className={`flex items-center gap-3 text-sm px-3 py-2 rounded-lg border ${
                            result?.answersShown && right ? "bg-emerald-50 border-emerald-200" : result?.answersShown && chosen ? "bg-red-50 border-red-200" : "border-gray-100"
                          }`}
                        >
                          <input
                            type={multi ? "checkbox" : "radio"}
                            name={q.id}
                            checked={chosen}
                            disabled={Boolean(result)}
                            onChange={() =>
                              multi
                                ? set(chosen ? (value as string[]).filter((x) => x !== o.id) : [...(Array.isArray(value) ? value : []), o.id])
                                : set(o.id)
                            }
                          />
                          {o.text === "True" ? t("True") : o.text === "False" ? t("False") : o.text}
                        </label>
                      );
                    })}
                  </div>
                )}
                {memo && (
                  <div className="mt-3 text-xs text-gray-600">
                    {q.type === "text" && !memo.isCorrect && memo.acceptedAnswers.length > 0 && <p>{t("Accepted answer:")} {memo.acceptedAnswers.join(" / ")}</p>}
                    {memo.explanation && <p className="mt-1">{memo.explanation}</p>}
                  </div>
                )}
              </div>
            );
          })}
          {!result && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => submit()}
                disabled={submitting}
                className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {submitting ? t("Marking...") : t("Hand in")}
              </button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
