"use client";

import { useRef, useState } from "react";
import { IconPlus, IconX } from "@/components/Icons";
import { Onboarding } from "@/components/Onboarding";
import { useStore } from "@/lib/store";
import type { Assumption, Company, Experiment, Profile, Workspace } from "@/lib/types";
import { cx, formatDate, today, uid } from "@/lib/util";

const PROFILE_FIELDS: { key: keyof Profile; label: string; hint?: string; short?: boolean }[] = [
  { key: "oneLiner", label: "One-liner", short: true },
  { key: "industry", label: "Industry", short: true },
  { key: "stage", label: "Stage", short: true },
  { key: "mission", label: "Mission" },
  { key: "vision", label: "Vision" },
  { key: "products", label: "Products" },
  { key: "customers", label: "Customers", hint: "Who they are, who buys, who uses." },
  { key: "businessModel", label: "Business model" },
  { key: "revenue", label: "Revenue", hint: "MRR/ARR, growth, concentration." },
  { key: "pricing", label: "Pricing" },
  { key: "technology", label: "Technology" },
  { key: "competitors", label: "Competitors & alternatives" },
  { key: "goals", label: "Goals" },
  { key: "team", label: "Team" },
];

const EXP_STATUS: Experiment["status"][] = ["open", "won", "lost", "inconclusive"];
const ASSUMPTION_STATUS: Assumption["status"][] = ["untested", "validated", "invalidated"];
const ASSUMPTION_TONE = { untested: "warn", validated: "good", invalidated: "bad" } as const;
const EXP_TONE = { open: "info", won: "good", lost: "bad", inconclusive: "neutral" } as const;

export default function MemoryPage() {
  const { hydrated, company, updateCompany, deleteCompany, workspace, replaceWorkspace } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [metric, setMetric] = useState({ label: "", value: "" });
  const [assumption, setAssumption] = useState("");
  const [decision, setDecision] = useState({ title: "", decision: "" });

  if (!hydrated) return <div className="page" />;
  if (!company) return <Onboarding />;

  const up = (fn: (c: Company) => Company) => updateCompany(company.id, fn);
  const filled = PROFILE_FIELDS.filter((f) => company.profile[f.key]?.trim()).length;

  const exportWorkspace = () => {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `founder-os-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importWorkspace = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Workspace;
      if (parsed?.version !== 1 || !Array.isArray(parsed.companies)) throw new Error("Not a Founder OS export.");
      if (confirm("Replace the current workspace with this file?")) replaceWorkspace(parsed);
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="page">
      <div className="row between wrap gap-16" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Company memory</div>
          <input
            className="title"
            aria-label="Company name"
            value={company.name}
            onChange={(e) => up((c) => ({ ...c, name: e.target.value }))}
            style={{ background: "transparent", border: 0, outline: "none", color: "var(--text)", fontSize: 38, padding: 0, width: "100%" }}
          />
          <p className="subtitle">
            Everything the engine knows. It uses this on every answer and never asks for it again.
          </p>
        </div>
        <div className="row gap-8">
          <button className="btn sm" onClick={exportWorkspace}>
            Export
          </button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && importWorkspace(e.target.files[0])}
          />
        </div>
      </div>

      <div className="row gap-12 mt-16">
        <div className="bar" style={{ width: 200 }}>
          <i style={{ width: `${(filled / PROFILE_FIELDS.length) * 100}%` }} />
        </div>
        <span className="tiny muted">
          {filled}/{PROFILE_FIELDS.length} profile fields · {company.sessions.length} conversations remembered
        </span>
      </div>

      {/* PROFILE */}
      <section className="card mt-24">
        <div className="card-head">
          <h3 className="h3">Company profile</h3>
          <span className="tiny muted">Saved automatically</span>
        </div>
        <div className="grid g3">
          {PROFILE_FIELDS.filter((f) => f.short).map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={`pf-${f.key}`}>
                {f.label}
              </label>
              <input
                id={`pf-${f.key}`}
                className="input"
                value={company.profile[f.key]}
                onChange={(e) => up((c) => ({ ...c, profile: { ...c.profile, [f.key]: e.target.value } }))}
              />
            </div>
          ))}
        </div>
        <div className="grid g2 mt-16">
          {PROFILE_FIELDS.filter((f) => !f.short).map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={`pf-${f.key}`}>
                {f.label}
                {f.hint && <span style={{ color: "var(--faint)" }}> · {f.hint}</span>}
              </label>
              <textarea
                id={`pf-${f.key}`}
                className="textarea"
                rows={3}
                value={company.profile[f.key]}
                onChange={(e) => up((c) => ({ ...c, profile: { ...c.profile, [f.key]: e.target.value } }))}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="grid g2 mt-16">
        {/* METRICS */}
        <section className="card" id="metrics">
          <div className="card-head">
            <h3 className="h3">Key metrics</h3>
          </div>
          <ul className="list-clean">
            {company.metrics.map((m) => (
              <li key={m.id} className="row gap-8">
                <input
                  className="input"
                  value={m.label}
                  aria-label="Metric name"
                  onChange={(e) =>
                    up((c) => ({ ...c, metrics: c.metrics.map((x) => (x.id === m.id ? { ...x, label: e.target.value } : x)) }))
                  }
                />
                <input
                  className="input"
                  value={m.value}
                  aria-label="Metric value"
                  onChange={(e) =>
                    up((c) => ({ ...c, metrics: c.metrics.map((x) => (x.id === m.id ? { ...x, value: e.target.value } : x)) }))
                  }
                />
                <button className="icon-btn" aria-label="Remove metric" onClick={() => up((c) => ({ ...c, metrics: c.metrics.filter((x) => x.id !== m.id) }))}>
                  <IconX style={{ width: 14, height: 14 }} />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="row gap-8 mt-8"
            onSubmit={(e) => {
              e.preventDefault();
              if (!metric.label.trim()) return;
              up((c) => ({ ...c, metrics: [...c.metrics, { id: uid(), label: metric.label.trim(), value: metric.value.trim() }] }));
              setMetric({ label: "", value: "" });
            }}
          >
            <input className="input" placeholder="Metric (e.g. MRR)" value={metric.label} onChange={(e) => setMetric({ ...metric, label: e.target.value })} />
            <input className="input" placeholder="Value" value={metric.value} onChange={(e) => setMetric({ ...metric, value: e.target.value })} />
            <button className="btn sm" aria-label="Add metric" disabled={!metric.label.trim()}>
              <IconPlus />
            </button>
          </form>
        </section>

        {/* ASSUMPTIONS */}
        <section className="card">
          <div className="card-head">
            <h3 className="h3">Assumptions</h3>
            <span className="tiny muted">Click status to change</span>
          </div>
          <ul className="list-clean">
            {company.assumptions.map((a) => (
              <li key={a.id} className="row between gap-8">
                <span className="small">{a.text}</span>
                <span className="row gap-4" style={{ flex: "none" }}>
                  <button
                    className={cx("badge", ASSUMPTION_TONE[a.status])}
                    style={{ cursor: "pointer", border: 0 }}
                    onClick={() =>
                      up((c) => ({
                        ...c,
                        assumptions: c.assumptions.map((x) =>
                          x.id === a.id
                            ? { ...x, status: ASSUMPTION_STATUS[(ASSUMPTION_STATUS.indexOf(x.status) + 1) % ASSUMPTION_STATUS.length] }
                            : x,
                        ),
                      }))
                    }
                  >
                    {a.status}
                  </button>
                  <button className="icon-btn" aria-label="Remove assumption" onClick={() => up((c) => ({ ...c, assumptions: c.assumptions.filter((x) => x.id !== a.id) }))}>
                    <IconX style={{ width: 14, height: 14 }} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <form
            className="row gap-8 mt-8"
            onSubmit={(e) => {
              e.preventDefault();
              if (!assumption.trim()) return;
              up((c) => ({ ...c, assumptions: [{ id: uid(), date: today(), text: assumption.trim(), status: "untested" }, ...c.assumptions] }));
              setAssumption("");
            }}
          >
            <input className="input" placeholder="We believe that…" value={assumption} onChange={(e) => setAssumption(e.target.value)} />
            <button className="btn sm" aria-label="Add assumption" disabled={!assumption.trim()}>
              <IconPlus />
            </button>
          </form>
        </section>
      </div>

      {/* DECISIONS */}
      <section className="card mt-16">
        <div className="card-head">
          <h3 className="h3">Decision log</h3>
        </div>
        {company.decisions.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Date</th>
                <th>Question</th>
                <th>Decision</th>
                <th style={{ width: 30 }} />
              </tr>
            </thead>
            <tbody>
              {company.decisions.map((d) => (
                <tr key={d.id}>
                  <td className="muted small">{formatDate(d.date)}</td>
                  <td className="small">{d.title}</td>
                  <td className="small">
                    {d.decision}
                    {d.rationale && <div className="tiny muted" style={{ marginTop: 3 }}>{d.rationale}</div>}
                  </td>
                  <td>
                    <button className="icon-btn" aria-label="Remove decision" onClick={() => up((c) => ({ ...c, decisions: c.decisions.filter((x) => x.id !== d.id) }))}>
                      <IconX style={{ width: 14, height: 14 }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form
          className="row gap-8 mt-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (!decision.decision.trim()) return;
            up((c) => ({
              ...c,
              decisions: [{ id: uid(), date: today(), title: decision.title.trim() || "Decision", decision: decision.decision.trim(), rationale: "" }, ...c.decisions],
            }));
            setDecision({ title: "", decision: "" });
          }}
        >
          <input className="input" style={{ maxWidth: 260 }} placeholder="Topic" value={decision.title} onChange={(e) => setDecision({ ...decision, title: e.target.value })} />
          <input className="input" placeholder="What we decided" value={decision.decision} onChange={(e) => setDecision({ ...decision, decision: e.target.value })} />
          <button className="btn sm" aria-label="Add decision" disabled={!decision.decision.trim()}>
            <IconPlus />
          </button>
        </form>
      </section>

      {/* EXPERIMENTS */}
      <section className="card mt-16">
        <div className="card-head">
          <h3 className="h3">Experiments & results</h3>
        </div>
        {company.experiments.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Experiment</th>
                <th>Metric</th>
                <th style={{ width: 130 }}>Status</th>
                <th>Result</th>
                <th style={{ width: 30 }} />
              </tr>
            </thead>
            <tbody>
              {company.experiments.map((x) => (
                <tr key={x.id}>
                  <td className="small">
                    {x.title}
                    <div className="tiny muted" style={{ marginTop: 3 }}>{x.hypothesis}</div>
                  </td>
                  <td className="small muted">{x.metric}</td>
                  <td>
                    <select
                      className={cx("badge", EXP_TONE[x.status])}
                      style={{ border: 0, cursor: "pointer", appearance: "none" }}
                      value={x.status}
                      onChange={(e) =>
                        up((c) => ({
                          ...c,
                          experiments: c.experiments.map((y) => (y.id === x.id ? { ...y, status: e.target.value as Experiment["status"] } : y)),
                        }))
                      }
                    >
                      {EXP_STATUS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      style={{ padding: "6px 9px", fontSize: 13 }}
                      placeholder="What happened?"
                      value={x.result}
                      onChange={(e) =>
                        up((c) => ({ ...c, experiments: c.experiments.map((y) => (y.id === x.id ? { ...y, result: e.target.value } : y)) }))
                      }
                    />
                  </td>
                  <td>
                    <button className="icon-btn" aria-label="Remove experiment" onClick={() => up((c) => ({ ...c, experiments: c.experiments.filter((y) => y.id !== x.id) }))}>
                      <IconX style={{ width: 14, height: 14 }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">Experiments tracked from Grow mode appear here, with their results.</div>
        )}
      </section>

      <section className="mt-48 row between wrap gap-12" style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
        <span className="tiny muted">Memory is stored in this browser. Export regularly to keep a backup.</span>
        <button
          className="btn ghost sm"
          style={{ color: "var(--bad)" }}
          onClick={() => confirm(`Delete ${company.name} and all of its memory?`) && deleteCompany(company.id)}
        >
          Delete company
        </button>
      </section>
    </div>
  );
}
