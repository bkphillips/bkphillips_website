"use client";

import { useState } from "react";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Which teams have the widest spans of control?",
  "What happened to attrition in 2024, and where?",
  "How did office attendance change, and has it held?",
];

export function Assistant({ scope, orgName }: { scope: number; orgName: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ code: string; text: string } | null>(null);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || pending) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setDraft("");
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/org/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Recent turns only; the server caps the conversation length.
        body: JSON.stringify({ scope, messages: next.slice(-11) }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError({ code: body.code ?? "error", text: body.error ?? "Something went wrong." });
        return;
      }
      setTurns([...next, { role: "assistant", content: String(body.reply) }]);
    } catch {
      setError({ code: "network", text: "Could not reach the server." });
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      {turns.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-full border border-line px-3.5 py-1.5 text-left text-sm text-ink transition-colors hover:border-ink/50"
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <ol className="space-y-5" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} className={t.role === "user" ? "flex justify-end" : ""}>
              {t.role === "user" ? (
                <p className="max-w-[80%] rounded-2xl bg-ink px-4 py-2.5 text-sm text-paper">{t.content}</p>
              ) : (
                <div className="max-w-[70ch] space-y-3 leading-relaxed whitespace-pre-wrap text-ink/90">
                  {t.content}
                </div>
              )}
            </li>
          ))}
          {pending && <li className="text-sm text-muted">Looking at the data…</li>}
        </ol>
      )}

      {error && (
        <p className="mt-5 rounded-xl border border-line bg-paper px-4 py-3 text-sm text-muted">
          {error.code === "not_configured"
            ? "The assistant is switched off: this copy of the site has no API key yet. Everything else on this page works without it."
            : error.text}
        </p>
      )}

      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={600}
          placeholder={`Ask about ${orgName}`}
          aria-label={`Ask a question about ${orgName}`}
          className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2.5 text-sm text-ink placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
      <p className="mt-3 text-xs leading-relaxed text-faint">
        Answers are written by an AI model that can only call a fixed set of metric functions,
        limited to the organization you are viewing. It can still misread a result, so check
        important numbers against the charts.
      </p>
    </div>
  );
}
