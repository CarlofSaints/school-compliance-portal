"use client";

import { useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import LessonText from "@/components/LessonText";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

// "Ask Jono", on every portal page. The conversation lives in this tab only:
// nothing is stored, so closing the tab forgets it.
export default function AskJono() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/jono", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setTurns([...next, { role: "assistant", content: body.answer }]);
      else {
        // Take the question back off so it can be asked again.
        setTurns(turns);
        setDraft(q);
        setError(body.error || t("Jono could not answer just now. Please try again."));
      }
    } catch {
      setTurns(turns);
      setDraft(q);
      setError(t("Could not reach Jono. Check your connection and try again."));
    }
    setBusy(false);
  };

  const examples = [t("Where are we with the school hall project?"), t("Can I suspend a learner for hitting another child?"), t("What did the last SGB or board meeting decide?")];

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
          <p className="font-semibold text-dark">{t("Ask Jono")}</p>
          <p className="text-xs text-gray-400">{t("About your minutes, actions and projects, or school law")}</p>
        </div>
        <div className="flex items-center gap-3">
          {turns.length > 0 && (
            <button onClick={() => { setTurns([]); setError(""); }} className="text-xs text-gray-400 hover:text-gray-600">
              {t("New chat")}
            </button>
          )}
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none" aria-label={t("Close")}>
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">{t("Hi, I'm Jono. Ask me anything about your school's meetings, actions and projects, or about the rules schools must follow. For example:")}</p>
            {examples.map((e) => (
              <button key={e} onClick={() => ask(e)} className="block w-full text-left text-sm border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">
                {e}
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
            </div>
          )
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
