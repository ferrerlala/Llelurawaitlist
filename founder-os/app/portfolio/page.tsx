"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IconArrow, IconLayers, IconPlus } from "@/components/Icons";
import { mergeFounderPortfolio, SAMPLE_COMPANY_NAMES } from "@/lib/founder-portfolio";
import { useStore } from "@/lib/store";
import { cx, formatDate } from "@/lib/util";

const REC_TONE = {
  "KEEP SEPARATE": "neutral",
  "SHARED INFRASTRUCTURE": "info",
  "ONE PLATFORM, MULTIPLE PRODUCTS": "accent",
  MERGE: "good",
} as const;

const STRENGTH_TONE = { weak: "neutral", moderate: "info", strong: "accent" } as const;

export default function PortfolioPage() {
  return (
    <Suspense fallback={<div className="page" />}>
      <Portfolio />
    </Suspense>
  );
}

function Portfolio() {
  const params = useSearchParams();
  const { hydrated, workspace, company, setActive, createCompany, runPortfolio, portfolioTask, replaceWorkspace } = useStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [oneLiner, setOneLiner] = useState("");

  useEffect(() => {
    if (params.get("new")) setAdding(true);
  }, [params]);

  if (!hydrated) return <div className="page" />;
  const p = workspace.portfolio;
  const companies = workspace.companies;

  return (
    <div className="page">
      <div className="row between wrap gap-16" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Portfolio intelligence</div>
          <h1 className="title" style={{ fontSize: 38 }}>
            Separate companies, or one platform?
          </h1>
          <p className="subtitle">I look for what your companies share and what should be built once.</p>
        </div>
        <div className="row gap-8">
          {(
            <button
              className="btn"
              onClick={() => {
                const hasSample = workspace.companies.some((c) => SAMPLE_COMPANY_NAMES.includes(c.name));
                const drop = hasSample && confirm("Remove the fictional sample companies while loading yours?");
                replaceWorkspace(mergeFounderPortfolio(workspace, drop));
              }}
            >
              {workspace.companies.some((c) => c.name === "HAOI") ? "Refresh my companies" : "Load my companies"}
            </button>
          )}
          <button className="btn" onClick={() => setAdding(true)}>
            <IconPlus /> Add company
          </button>
          <button className="btn primary" onClick={runPortfolio} disabled={companies.length < 2 || portfolioTask.running}>
            {portfolioTask.running ? "Detecting…" : "Detect relationships"}
          </button>
        </div>
      </div>
      {companies.length < 2 && <div className="tiny muted mt-8">Add at least two companies or projects to run the platform detector.</div>}
      {portfolioTask.error && <div className="alert danger mt-16 small">{portfolioTask.error}</div>}

      {adding && (
        <form
          className="card mt-24 fade-in"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createCompany(name.trim(), { oneLiner });
            setName("");
            setOneLiner("");
            setAdding(false);
          }}
        >
          <div className="grid g2">
            <div>
              <label className="label" htmlFor="nc-name">
                Name
              </label>
              <input id="nc-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="nc-one">
                One-liner
              </label>
              <input id="nc-one" className="input" value={oneLiner} onChange={(e) => setOneLiner(e.target.value)} />
            </div>
          </div>
          <div className="row mt-16" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!name.trim()}>
              Create
            </button>
          </div>
        </form>
      )}

      <div className="grid g3 mt-24">
        {companies.map((c) => (
          <button
            key={c.id}
            className="card"
            onClick={() => setActive(c.id)}
            style={{
              textAlign: "left",
              cursor: "pointer",
              borderColor: c.id === company?.id ? "var(--accent-line)" : undefined,
            }}
          >
            <div className="row between">
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              {c.brief && <span className="tiny muted">Readiness {c.brief.readiness.overall}</span>}
            </div>
            <div className="small muted mt-8">{c.profile.oneLiner || "No description yet."}</div>
            <div className="row gap-8 wrap mt-16">
              {c.profile.industry && <span className="chip">{c.profile.industry}</span>}
              {c.profile.stage && (
                <span className="chip" style={{ whiteSpace: "normal", maxWidth: "100%" }}>
                  {c.profile.stage}
                </span>
              )}
              {c.id === company?.id && <span className="badge accent">Active</span>}
            </div>
          </button>
        ))}
      </div>

      {p && (
        <div className="stack gap-16 mt-32 fade-in">
          <div className="tiny muted">Analyzed {formatDate(p.date)}</div>

          <section className="answer-block">
            <div className="row gap-8">
              <span className="eyebrow">Recommendation</span>
              <span className={cx("badge", REC_TONE[p.structure_recommendation] ?? "neutral")}>{p.structure_recommendation}</span>
            </div>
            <p className="answer-text" style={{ fontSize: 26 }}>
              {p.recommendation_rationale}
            </p>
          </section>

          {p.structure_recommendation !== "KEEP SEPARATE" && p.core_platform.layers.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h3 className="h3">
                  <IconLayers style={{ width: 14, height: 14, verticalAlign: -2, marginRight: 6, color: "var(--accent)" }} />
                  {p.core_platform.name || "Core platform"}
                </h3>
              </div>
              <div className="row gap-8 wrap" style={{ justifyContent: "center" }}>
                {p.core_platform.products_on_top.map((prod) => (
                  <div
                    key={prod}
                    className="card"
                    style={{ padding: "12px 16px", flex: "1 1 180px", textAlign: "center", borderColor: "var(--accent-line)", background: "var(--accent-soft)" }}
                  >
                    {prod}
                  </div>
                ))}
              </div>
              <div className="stack gap-4 mt-8">
                {[...p.core_platform.layers].reverse().map((l, i) => (
                  <div
                    key={l}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "1px solid var(--line)",
                      background: `rgba(255,255,255,${0.015 + i * 0.008})`,
                      textAlign: "center",
                      fontSize: 14,
                    }}
                  >
                    {l}
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid g2">
            <section className="card">
              <div className="card-head">
                <h3 className="h3">Build once, reuse everywhere</h3>
              </div>
              <ul className="list-clean">
                {p.shared_capabilities.map((s) => (
                  <li key={s.capability}>
                    <div className="row between gap-8">
                      <span style={{ fontWeight: 500 }}>{s.capability}</span>
                      <span className="tiny muted">{s.used_by.join(" · ")}</span>
                    </div>
                    <div className="small muted" style={{ marginTop: 3 }}>
                      {s.build_once_note}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card">
              <div className="card-head">
                <h3 className="h3">Relationships</h3>
              </div>
              <ul className="list-clean">
                {p.relationships.map((r, i) => (
                  <li key={i}>
                    <div className="row between gap-8">
                      <span style={{ fontWeight: 500 }}>{r.companies.join(" ↔ ")}</span>
                      <span className={cx("badge", STRENGTH_TONE[r.strength] ?? "neutral")}>{r.strength}</span>
                    </div>
                    <div className="small muted" style={{ marginTop: 3 }}>
                      {r.relationship}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid g2">
            <section className="card">
              <div className="eyebrow" style={{ color: "var(--accent)" }}>
                Where your attention goes now
              </div>
              <p className="serif" style={{ fontSize: 21, margin: "8px 0 0" }}>
                {p.focus_call}
              </p>
            </section>
            <section className="card">
              <div className="card-head">
                <h3 className="h3">Next 3 moves</h3>
              </div>
              {p.next_3_moves.map((m, i) => (
                <div className="move" key={i}>
                  <div className="move-n">{i + 1}</div>
                  <div className="move-t" style={{ fontSize: 15 }}>
                    {m}
                  </div>
                </div>
              ))}
            </section>
          </div>
        </div>
      )}

      {!p && companies.length >= 2 && !portfolioTask.running && (
        <div className="card empty mt-32">
          <p>Run the platform detector to see whether these should stay separate or become one platform.</p>
          <button className="btn primary mt-16" onClick={runPortfolio}>
            Detect relationships <IconArrow />
          </button>
        </div>
      )}
    </div>
  );
}
