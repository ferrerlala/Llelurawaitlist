"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MiniBars, ReadinessRadar, ScoreRing, VerdictBadge } from "@/components/Charts";
import { IconArrow, IconPlus, IconRefresh, IconX } from "@/components/Icons";
import { Onboarding } from "@/components/Onboarding";
import { useStore } from "@/lib/store";
import { cx, formatDate, today, uid } from "@/lib/util";

const HEALTH_TONE = { CRITICAL: "bad", FRAGILE: "warn", STABLE: "info", STRONG: "good", EXCEPTIONAL: "accent" } as const;

export default function CommandCenter() {
  const router = useRouter();
  const { hydrated, company, setDraft, refreshBrief, briefTask, updateCompany } = useStore();
  const [q, setQ] = useState("");
  const [idea, setIdea] = useState("");

  if (!hydrated) return <div className="page" />;
  if (!company) return <Onboarding />;

  const b = company.brief;
  const openExperiments = company.experiments.filter((e) => e.status === "open");
  const nowSignals = (b?.radar ?? []).filter((s) => s.urgency === "now");
  // Committed near-term actions first, topped up with the brief's recommendations.
  const topActions = [
    ...company.actions.filter((a) => !a.done && (a.horizon === "today" || a.horizon === "week")).map((a) => a.text),
    ...(b?.top_3_actions ?? []),
  ]
    .filter((t, i, all) => all.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
    .slice(0, 3);

  const ask = (text: string) => {
    if (text.trim().length < 3) return;
    setDraft({ mode: "think", input: text.trim() });
    router.push("/brain");
  };

  const addIdea = () => {
    if (!idea.trim()) return;
    updateCompany(company.id, (c) => ({ ...c, ideas: [{ id: uid(), date: today(), text: idea.trim() }, ...c.ideas] }));
    setIdea("");
  };

  return (
    <div className="page">
      <div className="row between wrap gap-16" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Founder OS · {company.name}</div>
          <h1 className="display">Your strategic intelligence layer.</h1>
        </div>
        <button className="btn" onClick={refreshBrief} disabled={briefTask.running}>
          <IconRefresh style={briefTask.running ? { animation: "spin 1.2s linear infinite" } : undefined} />
          {briefTask.running ? "Assessing company…" : b ? "Refresh brief" : "Generate brief"}
        </button>
      </div>
      {b && <div className="tiny muted mt-8">Brief updated {formatDate(b.date)}</div>}
      {briefTask.error && <div className="alert danger mt-16 small">{briefTask.error}</div>}

      {/* CEO Brain entry */}
      <form
        className="composer mt-32"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <div className="row" style={{ padding: "6px 6px 6px 18px" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="What are you thinking about?"
            aria-label="Ask the CEO Brain"
            style={{
              flex: 1,
              background: "transparent",
              border: 0,
              outline: "none",
              color: "var(--text)",
              fontFamily: "var(--font-serif)",
              fontSize: 22,
              padding: "12px 0",
              minWidth: 0,
            }}
          />
          <button className="btn primary" disabled={q.trim().length < 3}>
            Think <IconArrow />
          </button>
        </div>
      </form>

      {!b ? (
        <div className="card mt-24 fade-in" style={{ padding: 32 }}>
          <div className="row gap-24 wrap">
            <div style={{ flex: 1, minWidth: 260 }}>
              <div className="eyebrow">Command Center</div>
              <h2 className="title">Generate your first strategic brief</h2>
              <p className="muted">
                I&apos;ll score company readiness across twelve dimensions and surface your current priority, biggest
                opportunity, biggest risk, bottleneck and top actions. The more you put in{" "}
                <Link href="/memory" style={{ color: "var(--accent)" }}>
                  Company Memory
                </Link>
                , the sharper it gets.
              </p>
            </div>
            <div className="row" style={{ alignItems: "center" }}>
              <button className="btn primary" onClick={refreshBrief} disabled={briefTask.running}>
                {briefTask.running ? "Assessing…" : "Generate brief"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Health + priority */}
          <div className="grid g-health mt-24">
            <section className="card">
              <div className="row between">
                <div className="eyebrow">Company health</div>
                <span className={cx("badge", HEALTH_TONE[b.health] ?? "neutral")}>{b.health}</span>
              </div>
              <div className="row gap-24 mt-16" style={{ alignItems: "center" }}>
                <ScoreRing score={b.readiness.overall} label="Readiness" />
                <div style={{ flex: 1 }}>
                  <p className="small" style={{ margin: 0 }}>
                    {b.health_note}
                  </p>
                  <div className="mt-16">
                    <MiniBars values={company.readinessHistory.map((h) => h.score)} />
                  </div>
                </div>
              </div>
            </section>
            <section className="card" style={{ background: "radial-gradient(800px 200px at 0% 0%, rgba(214,183,122,0.08), transparent 60%), var(--surface)" }}>
              <div className="eyebrow" style={{ color: "var(--accent)" }}>
                Current priority
              </div>
              <p className="serif" style={{ fontSize: 28, lineHeight: 1.25, margin: "10px 0 0" }}>
                {b.current_priority}
              </p>
              <hr className="divider" />
              <div className="eyebrow">Current bottleneck</div>
              <p style={{ margin: "6px 0 0" }}>{b.current_bottleneck}</p>
            </section>
          </div>

          <div className="grid g2 mt-16">
            <section className="card stat">
              <div className="k" style={{ color: "var(--good)" }}>
                Biggest opportunity
              </div>
              <div className="v serif">{b.biggest_opportunity}</div>
            </section>
            <section className="card stat">
              <div className="k" style={{ color: "var(--bad)" }}>
                Biggest risk
              </div>
              <div className="v serif">{b.biggest_risk}</div>
            </section>
          </div>

          {/* Top 3 actions + radar now */}
          <div className="grid g2 mt-16">
            <section className="card">
              <div className="card-head">
                <h3 className="h3">Top 3 actions</h3>
                <Link href="/execution" className="tiny muted">
                  Execution →
                </Link>
              </div>
              {topActions.map((t, i) => (
                <div className="move" key={i}>
                  <div className="move-n">{i + 1}</div>
                  <div className="move-t" style={{ fontSize: 15 }}>
                    {t}
                  </div>
                </div>
              ))}
            </section>
            <section className="card">
              <div className="card-head">
                <h3 className="h3">Deserves attention now</h3>
                <Link href="/radar" className="tiny muted">
                  Radar →
                </Link>
              </div>
              {nowSignals.length ? (
                <ul className="list-clean">
                  {nowSignals.slice(0, 4).map((s, i) => (
                    <li key={i}>
                      <div className="eyebrow">{s.category}</div>
                      <div className="small" style={{ marginTop: 3 }}>
                        {s.signal}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty">Nothing urgent on the radar.</div>
              )}
            </section>
          </div>

          {b.missing_information.length > 0 && (
            <div className="alert info mt-16">
              <div style={{ flex: 1 }}>
                <div className="h3" style={{ color: "var(--info)" }}>
                  Sharpen my advice
                </div>
                <div className="small mt-8">
                  I&apos;m missing: {b.missing_information.join(" · ")}
                </div>
              </div>
              <Link href="/memory" className="btn sm">
                Add to memory
              </Link>
            </div>
          )}
        </>
      )}

      {/* Metrics */}
      <section className="mt-32">
        <div className="row between" style={{ marginBottom: 12 }}>
          <h3 className="h3">Key metrics</h3>
          <Link href="/memory#metrics" className="tiny muted">
            Edit →
          </Link>
        </div>
        {company.metrics.length ? (
          <div className="grid g4">
            {company.metrics.slice(0, 8).map((m) => (
              <div key={m.id} className="card stat">
                <div className="k">{m.label}</div>
                <div className="metric-v mt-8">{m.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card empty">
            No metrics yet. <Link href="/memory#metrics" style={{ color: "var(--accent)" }}>Add your key numbers</Link> so the
            engine can reason about them.
          </div>
        )}
      </section>

      {/* Readiness breakdown */}
      {b && (
        <section className="card mt-32">
          <div className="card-head">
            <h3 className="h3">Company readiness score</h3>
            <span className="tiny muted">Twelve dimensions · changes as the company develops</span>
          </div>
          <div className="grid g2" style={{ alignItems: "center" }}>
            <div style={{ display: "grid", placeItems: "center" }}>
              <ReadinessRadar dims={b.readiness.dimensions} />
            </div>
            <div>
              <p className="serif" style={{ fontSize: 19, marginTop: 0 }}>
                {b.readiness.summary}
              </p>
              <ul className="list-clean mt-16">
                {[...b.readiness.dimensions]
                  .sort((a, z) => a.score - z.score)
                  .slice(0, 4)
                  .map((d) => (
                    <li key={d.name} className="small">
                      <div className="row between">
                        <span>{d.name}</span>
                        <span className="muted">{d.score}</span>
                      </div>
                      <div className="muted tiny" style={{ marginTop: 2 }}>
                        {d.note}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Decisions / experiments / ideas */}
      <div className="grid g3 mt-32">
        <section className="card">
          <div className="card-head">
            <h3 className="h3">Recent decisions</h3>
          </div>
          {company.decisions.length ? (
            <ul className="list-clean">
              {company.decisions.slice(0, 4).map((d) => (
                <li key={d.id}>
                  <div className="small">{d.decision}</div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    {formatDate(d.date)} · {d.title}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">Decisions you log from the CEO Brain appear here.</div>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h3 className="h3">Open experiments</h3>
          </div>
          {openExperiments.length ? (
            <ul className="list-clean">
              {openExperiments.slice(0, 4).map((e) => (
                <li key={e.id}>
                  <div className="small">{e.title}</div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    {e.metric}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">No open experiments. Grow mode designs your next one.</div>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h3 className="h3">Ideas</h3>
          </div>
          <form
            className="row gap-8"
            onSubmit={(e) => {
              e.preventDefault();
              addIdea();
            }}
          >
            <input className="input" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Capture an idea…" />
            <button className="btn sm" aria-label="Add idea" disabled={!idea.trim()}>
              <IconPlus />
            </button>
          </form>
          <ul className="list-clean mt-8">
            {company.ideas.slice(0, 5).map((i) => (
              <li key={i.id} className="row between gap-8 small">
                <span>{i.text}</span>
                <span className="row gap-4" style={{ flex: "none" }}>
                  <button className="btn ghost sm" onClick={() => {
                    setDraft({ mode: "opportunity", input: `I think there is an opportunity in: ${i.text}` });
                    router.push("/brain");
                  }}>
                    Score
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="Remove idea"
                    onClick={() => updateCompany(company.id, (c) => ({ ...c, ideas: c.ideas.filter((x) => x.id !== i.id) }))}
                  >
                    <IconX style={{ width: 14, height: 14 }} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {company.sessions.length > 0 && (
        <section className="mt-32">
          <div className="row between" style={{ marginBottom: 12 }}>
            <h3 className="h3">Latest thinking</h3>
            <Link href="/brain" className="tiny muted">
              CEO Brain →
            </Link>
          </div>
          <Link href="/brain" className="card" style={{ display: "block" }}>
            <div className="row gap-8">
              <VerdictBadge verdict={company.sessions[0].result.verdict} />
              <span className="tiny muted">{formatDate(company.sessions[0].date)}</span>
            </div>
            <div className="muted small mt-8">“{company.sessions[0].input}”</div>
            <p className="serif" style={{ fontSize: 21, margin: "8px 0 0" }}>
              {company.sessions[0].result.answer}
            </p>
          </Link>
        </section>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
