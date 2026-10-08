"use client";

import { useState } from "react";
import { MODE_META } from "@/lib/engine-client";
import type { Analysis, BuildBlock, DecideBlock, GrowBlock, OpportunityBlock } from "@/lib/schemas";
import { useStore } from "@/lib/store";
import type { Session } from "@/lib/types";
import { cx, formatDate } from "@/lib/util";
import { ScoreRing, VerdictBadge, VerdictScale, scoreColor } from "./Charts";
import { IconCheck, IconChevron, IconLayers } from "./Icons";

const SYNTH_LABELS: [keyof Analysis["synthesis"], string][] = [
  ["best_opportunity", "Best opportunity"],
  ["biggest_problem", "Biggest problem"],
  ["best_product", "Best product"],
  ["best_business_model", "Best business model"],
  ["best_technology_approach", "Best technology approach"],
  ["biggest_competitive_advantage", "Biggest competitive advantage"],
  ["biggest_risk", "Biggest risk"],
  ["most_important_assumption", "Most important assumption"],
];

const TENX_LABELS: [keyof Analysis["ten_x"], string][] = [
  ["more_valuable", "10× more valuable"],
  ["easier_to_use", "10× easier to use"],
  ["faster", "10× faster"],
  ["harder_to_copy", "10× harder to copy"],
  ["serve_100x_customers", "100× more customers"],
  ["feature_to_platform", "Feature → platform"],
  ["company_to_category", "Company → category"],
];

const MOAT_TONE = { NONE: "bad", WEAK: "warn", MODERATE: "info", STRONG: "good" } as const;

export function AnalysisView({ session, onFollowUp }: { session: Session; onFollowUp?: (text: string) => void }) {
  const { logDecision, commitPlan, rememberFacts, trackExperiment, company } = useStore();
  const [deep, setDeep] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const r = session.result;

  const mark = (k: string) => setDone((d) => ({ ...d, [k]: true }));
  const decisionLogged = done.decision || company?.decisions.some((d) => d.id === session.id);
  const experimentTracked = done.experiment || company?.experiments.some((e) => e.id === session.id);

  return (
    <div className="stack gap-24 fade-in">
      <div className="row between wrap gap-12">
        <div className="row gap-8 wrap">
          <span className="badge neutral">{MODE_META[session.mode].label}</span>
          <VerdictBadge verdict={r.verdict} />
          <span className="tiny muted">{formatDate(session.date)}</span>
        </div>
        {onFollowUp && (
          <button className="btn ghost sm" onClick={() => onFollowUp(`Following up on "${session.input.slice(0, 120)}": `)}>
            Ask a follow-up
          </button>
        )}
      </div>

      <div className="muted" style={{ fontSize: 15, marginTop: -8 }}>
        “{session.input}”
      </div>

      {/* THE ANSWER */}
      <section className="answer-block">
        <div className="eyebrow">The answer</div>
        <p className="answer-text">{r.answer}</p>
      </section>

      {/* Mode headline panels the founder explicitly asked for */}
      {r.decide && <DecidePanel d={r.decide} />}
      {r.opportunity_scan && <OpportunityPanel o={r.opportunity_scan} />}
      {session.mode === "challenge" && <ChallengePanel items={r.challenges} />}

      {/* THE HIERARCHY */}
      <section className="card" style={{ padding: "6px 24px" }}>
        <Hier k="The why" v={r.why} />
        <Hier k="The opportunity" v={r.opportunity} />
        <Hier k="The risk" v={r.risk} />
        <Hier k="The decision" v={<strong style={{ fontWeight: 500 }}>{r.decision}</strong>} />
      </section>

      <section className="card">
        <div className="card-head">
          <h3 className="h3">The next 3 moves</h3>
        </div>
        {r.next_moves.slice(0, 3).map((m, i) => (
          <div className="move" key={i}>
            <div className="move-n">{i + 1}</div>
            <div>
              <div className="move-t">{m.move}</div>
              <div className="move-w">{m.why}</div>
            </div>
          </div>
        ))}
      </section>

      {r.build && <BuildPanel b={r.build} />}
      {r.grow && <GrowPanel g={r.grow} />}

      {r.platform_alert.detected && (
        <div className="alert">
          <IconLayers style={{ width: 20, height: 20, color: "var(--accent)", flex: "none", marginTop: 2 }} />
          <div>
            <div className="h3" style={{ color: "var(--accent)" }}>
              Platform detected
            </div>
            <div className="mt-8">{r.platform_alert.summary}</div>
            {r.platform_alert.shared_capabilities.length > 0 && (
              <div className="row wrap gap-8 mt-8">
                {r.platform_alert.shared_capabilities.map((c) => (
                  <span key={c} className="chip">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {r.learned_facts.length > 0 && !done.facts && (
        <div className="alert info">
          <div style={{ flex: 1 }}>
            <div className="h3" style={{ color: "var(--info)" }}>
              New to company memory
            </div>
            <ul className="list-clean mt-8">
              {r.learned_facts.map((f, i) => (
                <li key={i} className="small">
                  <span className="muted" style={{ textTransform: "capitalize" }}>
                    {f.field.replace(/([A-Z])/g, " $1")}:
                  </span>{" "}
                  {f.value}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <button
              className="btn sm"
              onClick={() => {
                rememberFacts(r.learned_facts);
                mark("facts");
              }}
            >
              Remember
            </button>
          </div>
        </div>
      )}

      <div className="row wrap gap-8">
        <button
          className="btn"
          disabled={!!decisionLogged}
          onClick={() => {
            logDecision(session);
            mark("decision");
          }}
        >
          {decisionLogged ? <IconCheck /> : null}
          {decisionLogged ? "Decision logged" : "Log this decision"}
        </button>
        <button
          className="btn"
          disabled={done.plan}
          onClick={() => {
            commitPlan(session);
            mark("plan");
          }}
        >
          {done.plan ? <IconCheck /> : null}
          {done.plan ? "Plan committed" : "Commit plan to Execution"}
        </button>
        {r.grow && (
          <button
            className="btn"
            disabled={!!experimentTracked}
            onClick={() => {
              trackExperiment(session);
              mark("experiment");
            }}
          >
            {experimentTracked ? <IconCheck /> : null}
            {experimentTracked ? "Experiment tracked" : "Track experiment"}
          </button>
        )}
      </div>

      <button className="deeper-toggle" onClick={() => setDeep((d) => !d)} aria-expanded={deep}>
        {deep ? "Hide the deeper analysis" : "Show me the deeper analysis"}
        <IconChevron style={{ width: 16, height: 16, transform: deep ? "rotate(180deg)" : undefined }} />
      </button>

      {deep && <DeepAnalysis r={r} mode={session.mode} />}
    </div>
  );
}

function Hier({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="hier">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function DeepAnalysis({ r, mode }: { r: Analysis; mode: Session["mode"] }) {
  return (
    <div className="stack gap-24 fade-in">
      {/* SYNTHESIS */}
      <section>
        <div className="row between mb-8" style={{ marginBottom: 12 }}>
          <h3 className="h3">Synthesis</h3>
        </div>
        <div className="synth-grid">
          <div className="synth-cell hero">
            <div className="k">Highest-leverage action</div>
            <div className="v">{r.synthesis.highest_leverage_action}</div>
          </div>
          {SYNTH_LABELS.map(([k, label]) => (
            <div className="synth-cell" key={k}>
              <div className="k">{label}</div>
              <div className="v">{r.synthesis[k]}</div>
            </div>
          ))}
          <div className="synth-cell">
            <div className="k">Founder verdict</div>
            <div className="mt-8">
              <VerdictScale verdict={r.verdict} />
            </div>
          </div>
        </div>
        <p className="muted small mt-16">{r.verdict_rationale}</p>
      </section>

      {/* INTELLIGENCE LENSES */}
      <section>
        <h3 className="h3" style={{ marginBottom: 12 }}>
          Multi-dimensional analysis
        </h3>
        <div className="grid g2">
          {r.dimensions.map((d, i) => (
            <div key={i} className={cx("lens-card", d.signal)}>
              <div className="row between">
                <span className="eyebrow">{d.dimension}</span>
                <span className="tiny muted" style={{ textTransform: "capitalize" }}>
                  {d.signal}
                </span>
              </div>
              <div className="hd">{d.headline}</div>
              <div className="bd">{d.insight}</div>
            </div>
          ))}
        </div>
      </section>

      {/* KILLER RISKS */}
      {r.killer_risks.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3 className="h3">Risks that could kill this</h3>
            <span className="tiny muted">Only the ones that matter</span>
          </div>
          <div className="grid" style={{ gap: 0 }}>
            {r.killer_risks.map((k, i) => (
              <div key={i} className="hier" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{k.risk}</div>
                  <div className="small muted mt-8">{k.why_it_kills}</div>
                </div>
                <div className="small">
                  <span className="eyebrow">Retire it</span>
                  <div className="mt-8">{k.mitigation}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 10X + MOAT */}
      <div className="grid g2">
        <section className="card">
          <div className="card-head">
            <h3 className="h3">10X engine</h3>
          </div>
          <ul className="list-clean">
            {TENX_LABELS.map(([k, label]) => (
              <li key={k}>
                <div className="eyebrow">{label}</div>
                <div className="small mt-8" style={{ marginTop: 4 }}>
                  {r.ten_x[k]}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <div className="card-head">
            <h3 className="h3">Moat engine</h3>
            <span className={cx("badge", MOAT_TONE[r.moat.strength] ?? "neutral")}>{r.moat.strength}</span>
          </div>
          <div className="eyebrow">Can it be copied in six months?</div>
          <p style={{ margin: "6px 0 0" }}>{r.moat.six_month_copy_test}</p>
          <hr className="divider" />
          <ul className="list-clean">
            {r.moat.sources.map((s, i) => (
              <li key={i} className="small">
                <div className="row between">
                  <span style={{ fontWeight: 500 }}>{s.type}</span>
                  <span
                    className={cx("badge", s.status === "exists" ? "good" : s.status === "buildable" ? "info" : "neutral")}
                  >
                    {s.status}
                  </span>
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  {s.assessment}
                </div>
              </li>
            ))}
          </ul>
          <hr className="divider" />
          <div className="eyebrow">How to strengthen it</div>
          <p className="small" style={{ margin: "6px 0 0" }}>
            {r.moat.how_to_strengthen}
          </p>
        </section>
      </div>

      {mode !== "challenge" && r.challenges.length > 0 && <ChallengePanel items={r.challenges} />}

      <ExecutionPanel e={r.execution} />

      {r.healthcare_considerations.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3 className="h3">Healthcare realities</h3>
            <span className="badge info">Regulatory · Clinical · Operational</span>
          </div>
          <ul className="list-clean">
            {r.healthcare_considerations.map((h, i) => (
              <li key={i} className="small">
                {h}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function ExecutionPanel({ e }: { e: Analysis["execution"] }) {
  const cols: [string, string[]][] = [
    ["Today", e.today],
    ["This week", e.this_week],
    ["This month", e.this_month],
    ["Next 90 days", e.next_90_days],
  ];
  return (
    <section className="card">
      <div className="card-head">
        <h3 className="h3">Execution engine</h3>
        <span className="tiny muted">Smallest set of actions, largest result</span>
      </div>
      <div className="grid g4">
        {cols.map(([label, items]) => (
          <div key={label}>
            <div className="eyebrow">{label}</div>
            <ul className="list-clean mt-8">
              {items.map((t, i) => (
                <li key={i} className="small">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChallengePanel({ items }: { items: string[] }) {
  return (
    <section className="card" style={{ borderColor: "rgba(224,122,110,0.25)" }}>
      <div className="card-head">
        <h3 className="h3" style={{ color: "var(--bad)" }}>
          Challenge me
        </h3>
        <span className="tiny muted">Respectful. Direct.</span>
      </div>
      {items.map((c, i) => (
        <div className="challenge" key={i}>
          {c}
        </div>
      ))}
    </section>
  );
}

function DecidePanel({ d }: { d: DecideBlock }) {
  const totals = d.options.map((_, oi) => d.criteria.reduce((sum, c) => sum + (c.scores[oi] ?? 0), 0));
  const maxTotal = Math.max(...totals);
  return (
    <section className="card">
      <div className="card-head">
        <h3 className="h3">Decision matrix</h3>
        <span className="tiny muted">1–10 · higher is better</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Criterion</th>
              {d.options.map((o) => (
                <th key={o} style={{ textTransform: "none", letterSpacing: 0, fontSize: 13, color: "var(--text)" }}>
                  {o}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.criteria.map((c) => {
              const best = Math.max(...c.scores);
              return (
                <tr key={c.criterion}>
                  <td>
                    <div>{c.criterion}</div>
                    <div className="tiny muted">{c.note}</div>
                  </td>
                  {d.options.map((o, oi) => {
                    const v = c.scores[oi] ?? 0;
                    return (
                      <td key={o} style={{ minWidth: 120 }}>
                        <div className="row gap-8">
                          <div className="bar" style={{ flex: 1 }}>
                            <i style={{ width: `${v * 10}%`, background: v === best ? "var(--accent)" : "var(--line-strong)" }} />
                          </div>
                          <span className="tiny" style={{ width: 18, textAlign: "right" }}>
                            {v}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr>
              <td style={{ fontWeight: 600 }}>Total</td>
              {totals.map((t, i) => (
                <td key={i} style={{ fontWeight: 600, color: t === maxTotal ? "var(--accent)" : undefined }}>
                  {t}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <hr className="divider" />
      <div className="eyebrow">Recommendation</div>
      <p className="serif" style={{ fontSize: 22, margin: "6px 0 0" }}>
        {d.recommendation}
      </p>
      <p className="muted" style={{ margin: "8px 0 0" }}>
        {d.why}
      </p>
      <div className="grid g3 mt-24">
        <div>
          <div className="eyebrow" style={{ color: "var(--good)" }}>
            What I would do
          </div>
          <p className="small" style={{ margin: "6px 0 0" }}>
            {d.what_i_would_do}
          </p>
        </div>
        <div>
          <div className="eyebrow" style={{ color: "var(--bad)" }}>
            What I would not do
          </div>
          <p className="small" style={{ margin: "6px 0 0" }}>
            {d.what_i_would_not_do}
          </p>
        </div>
        <div>
          <div className="eyebrow" style={{ color: "var(--accent)" }}>
            Next action
          </div>
          <p className="small" style={{ margin: "6px 0 0" }}>
            {d.next_action}
          </p>
        </div>
      </div>
    </section>
  );
}

function OpportunityPanel({ o }: { o: OpportunityBlock }) {
  const rows: [string, string][] = [
    ["Is it real?", o.is_real],
    ["How large?", o.how_large],
    ["Who needs it", o.who_needs_it],
    ["Who pays", o.who_pays],
    ["Why now", o.why_now],
    ["Competition", o.competition],
    ["Technology advantage", o.technology_advantage],
    ["Market timing", o.market_timing],
    ["Potential moat", o.potential_moat],
    ["Potential category", o.potential_category],
  ];
  return (
    <section className="card">
      <div className="row gap-24 wrap" style={{ alignItems: "center" }}>
        <ScoreRing score={o.score} label="Opportunity" />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="eyebrow">Opportunity score</div>
          <p className="serif" style={{ fontSize: 22, margin: "6px 0 0", color: scoreColor(o.score) }}>
            {o.score} / 100
          </p>
          <p style={{ margin: "8px 0 0" }}>{o.score_explanation}</p>
        </div>
      </div>
      <hr className="divider" />
      <div className="grid g2" style={{ gap: "4px 24px" }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <div className="eyebrow">{k}</div>
            <div className="small" style={{ marginTop: 4 }}>
              {v}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BuildPanel({ b }: { b: BuildBlock }) {
  const text: [string, string][] = [
    ["Problem", b.problem],
    ["Target customer", b.target_customer],
    ["Solution", b.solution],
    ["MVP", b.mvp],
    ["Technical architecture", b.technical_architecture],
    ["Business model", b.business_model],
    ["Pricing hypothesis", b.pricing_hypothesis],
    ["Validation strategy", b.validation_strategy],
    ["First customer", b.first_customer],
  ];
  return (
    <section className="card">
      <div className="card-head">
        <h3 className="h3">Build plan</h3>
      </div>
      <div className="grid g2" style={{ gap: "4px 28px" }}>
        {text.map(([k, v]) => (
          <div key={k} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <div className="eyebrow">{k}</div>
            <div className="small" style={{ marginTop: 4 }}>
              {v}
            </div>
          </div>
        ))}
      </div>
      <hr className="divider" />
      <div className="eyebrow">Core workflow</div>
      <ol className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {b.core_workflow.map((s, i) => (
          <li key={i} style={{ padding: "3px 0" }}>
            {s}
          </li>
        ))}
      </ol>
      <div className="grid g3 mt-24">
        <ListBlock title="Must-have features" items={b.must_have_features} tone="good" />
        <ListBlock title="Features to avoid" items={b.features_to_avoid} tone="bad" />
        <ListBlock title="AI opportunities" items={b.ai_opportunities} tone="accent" />
      </div>
      <div className="grid g2 mt-24">
        <ListBlock title="Success metrics" items={b.success_metrics} />
        <ListBlock title="Next 3 actions" items={b.next_3_actions} tone="accent" numbered />
      </div>
    </section>
  );
}

function GrowPanel({ g }: { g: GrowBlock }) {
  const rows: [string, string][] = [
    ["Growth opportunity", g.growth_opportunity],
    ["Best acquisition channel", g.best_acquisition_channel],
    ["Best customer segment", g.best_customer_segment],
    ["Pricing opportunity", g.pricing_opportunity],
    ["Expansion opportunity", g.expansion_opportunity],
    ["Partnership opportunity", g.partnership_opportunity],
  ];
  const x = g.next_growth_experiment;
  return (
    <section className="card">
      <div className="card-head">
        <h3 className="h3">Growth engine</h3>
      </div>
      <div className="alert danger" style={{ marginBottom: 16 }}>
        <div>
          <div className="eyebrow" style={{ color: "var(--bad)" }}>
            Biggest bottleneck
          </div>
          <div className="serif" style={{ fontSize: 20, marginTop: 4 }}>
            {g.biggest_bottleneck}
          </div>
        </div>
      </div>
      <div className="grid g2" style={{ gap: "4px 28px" }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <div className="eyebrow">{k}</div>
            <div className="small" style={{ marginTop: 4 }}>
              {v}
            </div>
          </div>
        ))}
      </div>
      <div className="card mt-16" style={{ background: "var(--bg-elev)" }}>
        <div className="eyebrow" style={{ color: "var(--accent)" }}>
          Next growth experiment
        </div>
        <div style={{ fontWeight: 500, marginTop: 6 }}>{x.test}</div>
        <div className="grid g3 mt-16 small">
          <div>
            <div className="muted tiny">Hypothesis</div>
            {x.hypothesis}
          </div>
          <div>
            <div className="muted tiny">Success metric</div>
            {x.success_metric}
          </div>
          <div>
            <div className="muted tiny">Duration</div>
            {x.duration}
          </div>
        </div>
      </div>
    </section>
  );
}

function ListBlock({
  title,
  items,
  tone,
  numbered,
}: {
  title: string;
  items: string[];
  tone?: "good" | "bad" | "accent";
  numbered?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow" style={tone ? { color: `var(--${tone})` } : undefined}>
        {title}
      </div>
      <ul className="list-clean mt-8">
        {items.map((t, i) => (
          <li key={i} className="small">
            {numbered && <span className="muted">{i + 1}. </span>}
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
