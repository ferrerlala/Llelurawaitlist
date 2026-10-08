"use client";

import { useEffect, useState } from "react";
import { DIMENSIONS } from "@/lib/schemas";
import type { RunState } from "@/lib/store";
import { cx } from "@/lib/util";

const STEPS = ["Intelligence engine", "Multi-dimensional analysis", "Synthesis", "Strategic decision", "Action plan"];

/** Infer pipeline progress from the keys that have streamed so far. */
function stageFrom(run: RunState) {
  const p = run.partial;
  if (!p) return 0;
  if (p.includes('"next_moves"') || p.includes('"execution"')) return 4;
  if (p.includes('"verdict"') || p.includes('"answer"')) return 3;
  if (p.includes('"synthesis"') || p.includes('"killer_risks"')) return 2;
  return 1;
}

export function EngineProgress({ run, onCancel }: { run: RunState; onCancel: () => void }) {
  const stage = stageFrom(run);
  const [tick, setTick] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setTick((n) => n + 1);
      setElapsed(Math.floor((Date.now() - run.startedAt) / 1000));
    }, 700);
    return () => clearInterval(t);
  }, [run.startedAt]);

  const streamed = new Set(
    DIMENSIONS.filter((d) => run.partial.includes(`"dimension":"${d}"`) || run.partial.includes(`"dimension": "${d}"`)),
  );
  // While reasoning, sweep a soft highlight across the lenses so the engine visibly works every lens.
  const sweeping = stage === 0 ? new Set([DIMENSIONS[tick % DIMENSIONS.length], DIMENSIONS[(tick + 4) % DIMENSIONS.length]]) : null;

  const status =
    stage === 0
      ? run.phase === "connecting"
        ? "Loading company memory…"
        : "Running every lens on your question…"
      : ["", "Analyzing through each lens…", "Resolving tensions into one conclusion…", "Committing to a decision…", "Turning strategy into action…"][stage];

  return (
    <div className="card fade-in" style={{ padding: 24 }}>
      <div className="row between wrap gap-12">
        <div className="row gap-8">
          <span className="status-dot pulse" />
          <span>{status}</span>
        </div>
        <div className="row gap-12">
          <span className="tiny muted" style={{ fontVariantNumeric: "tabular-nums" }}>
            {elapsed}s
          </span>
          <button className="btn ghost sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      <div className="pipeline mt-24">
        {STEPS.map((s, i) => (
          <div key={s} className={cx("pipe-step", i === stage && "active", i < stage && "done")}>
            <div className="n">{i < stage ? "✓" : `0${i + 1}`}</div>
            <div className="t">{s}</div>
          </div>
        ))}
      </div>

      <div className="lens-cloud mt-24">
        {DIMENSIONS.map((d) => (
          <span key={d} className={cx("lens", (streamed.has(d) || sweeping?.has(d) || stage >= 2) && "lit")}>
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}
