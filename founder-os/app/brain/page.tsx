"use client";

import { useEffect, useRef, useState } from "react";
import { AnalysisView } from "@/components/Analysis";
import { VerdictBadge } from "@/components/Charts";
import { EngineProgress } from "@/components/EngineProgress";
import { IconArrow } from "@/components/Icons";
import { MODE_META } from "@/lib/engine-client";
import { MODES, type Mode } from "@/lib/schemas";
import { useStore } from "@/lib/store";
import { cx, formatDate } from "@/lib/util";

const EXAMPLES = [
  "Should I build this?",
  "Why isn't this growing?",
  "How can I make this 10X better?",
  "Should I raise money?",
  "Which customer should I target?",
  "How should I combine my products?",
  "What's the biggest opportunity I'm missing?",
];

export default function BrainPage() {
  const { company, run, runAnalysis, cancelRun, resetRun, draft, setDraft, hydrated } = useStore();
  const [mode, setMode] = useState<Mode>("think");
  const [input, setInput] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Questions handed over from the Command Center run immediately.
  useEffect(() => {
    if (!hydrated || !draft) return;
    setMode(draft.mode);
    setInput(draft.input);
    setDraft(null);
    if (draft.input.trim().length >= 3) {
      setViewId(null);
      runAnalysis(draft.mode, draft.input.trim());
    }
  }, [hydrated, draft, setDraft, runAnalysis]);

  useEffect(() => {
    if (run.status === "done" && run.sessionId) setViewId(run.sessionId);
  }, [run.status, run.sessionId]);

  const sessions = company?.sessions ?? [];
  const viewed = sessions.find((s) => s.id === viewId) ?? null;
  const running = run.status === "running";

  const submit = () => {
    const q = input.trim();
    if (q.length < 3 || running) return;
    setViewId(null);
    runAnalysis(mode, q);
  };

  const followUp = (prefix: string) => {
    setMode("think");
    setInput(prefix);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => textRef.current?.focus(), 300);
  };

  return (
    <div className="page-narrow">
      <div className="eyebrow">CEO Brain{company ? ` · ${company.name}` : ""}</div>
      <h1 className="display">What are you thinking about?</h1>
      <p className="subtitle">
        One executive brain. Every lens. One decision{company ? `, grounded in everything ${company.name} has told me` : ""}.
      </p>

      <div className="segmented mt-32" role="tablist" aria-label="Thinking mode">
        {MODES.map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={cx(mode === m && "on")} onClick={() => setMode(m)}>
            {MODE_META[m].label}
          </button>
        ))}
      </div>
      <div className="tiny muted mt-8">{MODE_META[mode].hint}</div>

      <div className="composer mt-16">
        <textarea
          ref={textRef}
          value={input}
          placeholder={MODE_META[mode].placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="Your question"
        />
        <div className="composer-bar">
          <span className="tiny muted">
            <span className="kbd">⌘</span> <span className="kbd">↵</span> to think
          </span>
          <button className="btn primary" onClick={submit} disabled={running || input.trim().length < 3}>
            {running ? "Thinking…" : "Run the engine"}
            {!running && <IconArrow />}
          </button>
        </div>
      </div>

      {!input && !running && (
        <div className="row wrap gap-8 mt-16">
          {EXAMPLES.map((e) => (
            <button key={e} className="chip" onClick={() => setInput(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      <div className="mt-48">
        {running && <EngineProgress run={run} onCancel={cancelRun} />}

        {run.status === "error" && run.error && (
          <div className="alert danger fade-in">
            <div style={{ flex: 1 }}>
              <div className="h3" style={{ color: "var(--bad)" }}>
                The engine couldn&apos;t finish
              </div>
              <div className="mt-8">{run.error.message}</div>
              {run.error.code === "no_key" && (
                <pre className="tiny mt-16" style={{ background: "var(--bg)", padding: 12, borderRadius: 8, overflowX: "auto" }}>
                  {`cd founder-os\ncp .env.example .env.local   # then set ANTHROPIC_API_KEY\nnpm run dev`}
                </pre>
              )}
            </div>
            <div className="row gap-8" style={{ alignItems: "flex-start" }}>
              <button className="btn sm" onClick={() => runAnalysis(run.mode, run.input)}>
                Retry
              </button>
              <button className="btn ghost sm" onClick={resetRun}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {!running && viewed && <AnalysisView key={viewed.id} session={viewed} onFollowUp={followUp} />}
      </div>

      {sessions.length > 0 && (
        <section className="mt-48">
          <h3 className="h3" style={{ marginBottom: 10 }}>
            Previous thinking
          </h3>
          <div className="hist">
            {sessions.slice(0, 12).map((s) => (
              <button
                key={s.id}
                className={cx(s.id === viewId && "on")}
                onClick={() => {
                  setViewId(s.id);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <div className="row between gap-12">
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.input}</span>
                  <span className="row gap-8" style={{ flex: "none" }}>
                    <VerdictBadge verdict={s.result.verdict} />
                    <span className="tiny muted">{formatDate(s.date)}</span>
                  </span>
                </div>
                <div className="tiny muted" style={{ marginTop: 2 }}>
                  {MODE_META[s.mode].label} · {s.result.answer.slice(0, 140)}
                  {s.result.answer.length > 140 ? "…" : ""}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
