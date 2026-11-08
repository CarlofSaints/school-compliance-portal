"use client";

import { useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import LessonText from "@/components/LessonText";
import { jonoCharging } from "@/lib/jonoBilling";

interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Answered from the Guide with no AI (no credits). Only on screen. */
  free?: boolean;
  /** Credits this answer cost. Only on screen. */
  charged?: number;
}

/** A question waiting on credits: the quote, and whether it can be paid. */
interface Pending {
  next: Turn[];
  q: string;
  quote: number;
  balance: number;
  canSpend: boolean;
  buyUrl: string;
}

// "Ask Jono", on every portal page. The conversation lives in this tab only:
// nothing is stored, so closing the tab forgets it.
export default function AskJono() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setDraft("");
    // A question still waiting on credits is set aside, never sent twice in a row.
    send(pending ? pending.next : turns, q);
  };

  // One sender for a new question, "Use credits" and "Ask the AI instead".
  // `before` is the conversation without this question.
  const send = async (before: Turn[], q: string, opts: { accepted?: number; forceAi?: boolean } = {}) => {
    const next: Turn[] = [...before, { role: "user", content: q }];
    setTurns(next);
    setBusy(true);
    setError("");
    setPending(null);
    try {
      const res = await authFetch("/api/jono", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the words go to the server, never the on-screen labels.
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })), ...opts }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.needsCredits) {
        setPending({ next: before, q, quote: body.quote, balance: body.balance, canSpend: body.canSpend, buyUrl: body.buyUrl });
      } else if (res.ok) {
        setTurns([...next, { role: "assistant", content: body.answer, free: !!body.free, charged: body.charged }]);
      } else {
        // Take the question back off so it can be asked again.
        setTurns(before);
        setDraft(q);
        setError(body.error || t("Jono could not answer just now. Please try again."));
      }
    } catch {
      setTurns(before);
      setDraft(q);
      setError(t("Could not reach Jono. Check your connection and try again."));
    }
    setBusy(false);
  };

  // Each example says whether it is free (answered from the guide) or uses credits.
  const examples: [string, boolean][] = [
    [t("How do I create a new minutes template?"), true],
    [t("Where are we with the school hall project?"), false],
    [t("Can I suspend a learner for hitting another child?"), false],
  ];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-5 z-40 bg-primary hover:bg-primary-dark text-white pl-4 pr-5 py-3 rounded-full shadow-lg text-sm font-semibold flex items-center gap-2"
      >
        <span aria-hidden>💬</span>
        {t("Ask Jono")}
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label={t("Ask Jono")}
      className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-md h-[min(640px,calc(100vh-2.5rem))] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <p className="font-semibold text-dark flex items-center gap-2">
            {t("Ask Jono")}
            <button
              onClick={() => setAbout(!about)}
              aria-label={t("Why is he called Jono?")}
              title={t("Why is he called Jono?")}
              className={`w-5 h-5 rounded-full border text-[11px] font-bold leading-none flex items-center justify-center ${about ? "bg-primary text-white border-primary" : "border-gray-300 text-gray-500 hover:border-primary hover:text-primary"}`}
            >
              i
            </button>
          </p>
          <p className="text-xs text-gray-400">{t("About your minutes, actions and projects, school law, or how to use the portal")}</p>
        </div>
        <div className="flex items-center gap-3">
          {turns.length > 0 && (
            <button onClick={() => { setTurns([]); setError(""); setPending(null); }} className="text-xs text-gray-400 hover:text-gray-600">
              {t("New chat")}
            </button>
          )}
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none" aria-label={t("Close")}>
            ✕
          </button>
        </div>
      </div>

      {about && (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm text-gray-700">
          <p className="text-base font-semibold text-dark">🎓 {t("Why is he called Jono?")}</p>
          <p>
            {t("Jono is named in honour of Professor Jonathan Jansen, one of South Africa's best-known voices on education. He has been a school teacher, a dean of education, the Vice-Chancellor of the University of the Free State and a Distinguished Professor at Stellenbosch University, and has written widely about schools, leadership and change.")}
          </p>
          <p>{t("Our thinking was simple: if you are going to ask anyone about running a school, ask someone like him. So we named our assistant after him.")}</p>
          <p className="text-xs text-gray-400">
            {t("Jono is an AI assistant, not Professor Jansen, and is not connected to or endorsed by him. Jono can be wrong, so check before acting.")}
          </p>
          <button onClick={() => setAbout(false)} className="text-sm font-medium text-primary">
            &larr; {t("Back to the chat")}
          </button>
        </div>
      )}
      <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 ${about ? "hidden" : ""}`}>
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">{t("Hi, I'm Jono. Ask me anything about your school's meetings, actions and projects, or about the rules schools must follow. For example:")}</p>
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-1">
              <p>
                <span className="font-semibold text-emerald-700">{t("Free:")}</span> {t("how to use the portal (\"How do I...?\"), answered from the portal guide.")}
              </p>
              <p>
                <span className="font-semibold text-amber-700">{jonoCharging() ? t("Uses credits:") : t("Uses credits from 16 November:")}</span> {t("questions about your school's minutes, actions, projects or the law. Jono always shows the cost first and asks.")}
              </p>
              <p className="text-gray-400">
                {t("\"How do I\" questions the guide cannot answer are kept for 12 months, without your name, so we can add them to the guide.")}
              </p>
            </div>
            {examples.map(([e, free]) => (
              <button key={e} onClick={() => ask(e)} className="flex w-full items-center justify-between gap-2 text-left text-sm border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">
                <span>{e}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${free ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {free ? t("Free") : t("Credits")}
                </span>
              </button>
            ))}
          </div>
        )}
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div key={i} className="ml-8 bg-primary/10 rounded-xl px-3 py-2 text-sm text-dark whitespace-pre-wrap">{turn.content}</div>
          ) : (
            <div key={i} className="mr-4 bg-gray-50 rounded-xl px-3 py-1">
              <LessonText body={turn.content} />
              {turn.free && (
                <p className="text-xs text-gray-400 pb-1">
                  {t("From the portal guide, no credits used.")}{" "}
                  {i === turns.length - 1 && !busy && (
                    // The guide match missed: ask the same question of the AI.
                    <button type="button" onClick={() => send(turns.slice(0, i - 1), turns[i - 1].content, { forceAi: true })} className="underline">
                      {t("Not what you meant? Ask the AI instead")}
                    </button>
                  )}
                </p>
              )}
              {!!turn.charged && <p className="text-xs text-gray-400 pb-1">{t("This answer used {n} credits.", { n: turn.charged })}</p>}
            </div>
          )
        )}
        {pending && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-gray-800 space-y-2">
            {!pending.canSpend ? (
              <p>{t("This question requires credits, and you are not allowed to spend your school's credits. Ask an administrator to tick Can spend credits for you.")}</p>
            ) : pending.balance < pending.quote ? (
              <p>
                {pending.balance <= 0
                  ? t("This question requires credits and you have none left.")
                  : t("This question requires up to {n} credits and you have {b} left.", { n: pending.quote, b: pending.balance })}{" "}
                <a href={pending.buyUrl} className="font-medium underline">
                  {t("Buy more credits here")}
                </a>
              </p>
            ) : (
              <>
                <p>
                  {t("This question is going to require credits to answer: up to {n} (you have {b}). You are charged what it actually costs, never more than this.", { n: pending.quote, b: pending.balance })}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => send(pending.next, pending.q, { accepted: pending.quote, forceAi: true })} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark">
                    {t("Use up to {n} credits", { n: pending.quote })}
                  </button>
                  <button type="button" onClick={() => { setPending(null); setTurns(pending.next); setDraft(pending.q); }} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs">
                    {t("Cancel")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {busy && <p className="text-sm text-gray-400">{t("Jono is reading your records...")}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
        className="border-t border-gray-100 p-3"
      >
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(draft);
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder={t("Ask a question...")}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="bg-primary hover:bg-primary-dark text-white px-4 rounded-lg text-sm font-medium disabled:opacity-50">
            {t("Ask")}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          {t("Jono only sees what you may see in the portal. Your question goes to Anthropic's AI in the United States. Answers can be wrong: check before acting, and this is not legal advice.")}
        </p>
      </form>
    </div>
  );
}
