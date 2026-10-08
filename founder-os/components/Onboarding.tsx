"use client";

import { useState } from "react";
import { mergeFounderPortfolio } from "@/lib/founder-portfolio";
import { sampleWorkspace } from "@/lib/sample";
import { useStore } from "@/lib/store";
import { IconArrow } from "./Icons";

export function Onboarding() {
  const { createCompany, replaceWorkspace, workspace } = useStore();
  const [name, setName] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [industry, setIndustry] = useState("");
  const [stage, setStage] = useState("");

  return (
    <div className="page-narrow" style={{ paddingTop: 40 }}>
      <div className="eyebrow">Founder OS</div>
      <h1 className="display">Your strategic intelligence layer.</h1>
      <p className="subtitle" style={{ maxWidth: 560 }}>
        One executive brain behind your company. It remembers everything, runs every strategic lens at once, and tells you
        the highest-leverage decision.
      </p>

      <div className="answer-block mt-32 row between wrap gap-16">
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="eyebrow">Your portfolio</div>
          <div className="serif" style={{ fontSize: 24, marginTop: 6 }}>
            HAOI · Cumpliva · Elleah Health · Banlu
          </div>
          <div className="small muted mt-8">
            Load your four companies with what their prototypes already say, plus an initial brief for each and a
            portfolio analysis.
          </div>
        </div>
        <button className="btn primary" onClick={() => replaceWorkspace(mergeFounderPortfolio(workspace))}>
          Load my companies
        </button>
      </div>

      <form
        className="card mt-24"
        style={{ padding: 28 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) createCompany(name.trim(), { oneLiner, industry, stage });
        }}
      >
        <div className="eyebrow">Or start with another company</div>
        <div className="grid g2 mt-16">
          <div>
            <label className="label" htmlFor="ob-name">
              Company or project name
            </label>
            <input id="ob-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="ob-stage">
              Stage
            </label>
            <input
              id="ob-stage"
              className="input"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              placeholder="Idea · MVP · Seed · Series A…"
            />
          </div>
        </div>
        <div className="mt-16">
          <label className="label" htmlFor="ob-one">
            What does it do, in one sentence?
          </label>
          <input id="ob-one" className="input" value={oneLiner} onChange={(e) => setOneLiner(e.target.value)} />
        </div>
        <div className="mt-16">
          <label className="label" htmlFor="ob-ind">
            Industry
          </label>
          <input
            id="ob-ind"
            className="input"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. Healthcare AI, Fintech, Developer tools"
          />
        </div>
        <div className="row between wrap gap-12 mt-24">
          <span className="tiny muted">You can add more companies and fill in memory anytime.</span>
          <button className="btn primary" disabled={!name.trim()}>
            Create company <IconArrow />
          </button>
        </div>
      </form>

      <div className="row between wrap gap-12 mt-24 card" style={{ background: "transparent", borderStyle: "dashed" }}>
        <div>
          <div style={{ fontWeight: 500 }}>Explore first</div>
          <div className="small muted">Load a fictional three-company workspace with a full brief, analysis and portfolio.</div>
        </div>
        <button className="btn" onClick={() => replaceWorkspace(sampleWorkspace())}>
          Load sample workspace
        </button>
      </div>
    </div>
  );
}
