"use client";

import { useState } from "react";
import { IconPlus, IconX } from "@/components/Icons";
import { Onboarding } from "@/components/Onboarding";
import { useStore } from "@/lib/store";
import type { Action, Horizon } from "@/lib/types";
import { cx, today, uid } from "@/lib/util";

const COLUMNS: { key: Horizon; label: string; limit: number }[] = [
  { key: "today", label: "Today", limit: 2 },
  { key: "week", label: "This week", limit: 3 },
  { key: "month", label: "This month", limit: 3 },
  { key: "quarter", label: "Next 90 days", limit: 3 },
];

export default function ExecutionPage() {
  const { hydrated, company, updateCompany } = useStore();
  const [drafts, setDrafts] = useState<Record<Horizon, string>>({ today: "", week: "", month: "", quarter: "" });
  const [showDone, setShowDone] = useState(false);

  if (!hydrated) return <div className="page" />;
  if (!company) return <Onboarding />;

  const update = (fn: (a: Action[]) => Action[]) =>
    updateCompany(company.id, (c) => ({ ...c, actions: fn(c.actions) }));

  const open = company.actions.filter((a) => !a.done);
  const doneCount = company.actions.length - open.length;

  return (
    <div className="page">
      <div className="row between wrap gap-16" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Execution engine · {company.name}</div>
          <h1 className="title" style={{ fontSize: 38 }}>
            The smallest set of actions with the largest result
          </h1>
          <p className="subtitle">
            Strategy becomes action. Commit plans from the CEO Brain, or add your own. Fewer is better.
          </p>
        </div>
        <button className="btn ghost sm" onClick={() => setShowDone((s) => !s)}>
          {showDone ? "Hide completed" : `Show completed (${doneCount})`}
        </button>
      </div>

      <div className="grid g4 mt-32">
        {COLUMNS.map((col) => {
          const items = company.actions.filter((a) => a.horizon === col.key && (showDone || !a.done));
          const openCount = items.filter((a) => !a.done).length;
          return (
            <section key={col.key} className="card" style={{ padding: 18 }}>
              <div className="card-head" style={{ marginBottom: 6 }}>
                <h3 className="h3">{col.label}</h3>
                <span className={cx("tiny", openCount > col.limit ? "" : "muted")} style={openCount > col.limit ? { color: "var(--warn)" } : undefined}>
                  {openCount}/{col.limit}
                </span>
              </div>
              {openCount > col.limit && (
                <div className="tiny" style={{ color: "var(--warn)", marginBottom: 6 }}>
                  Too many. Cut to the {col.limit} that matter most.
                </div>
              )}
              <div>
                {items.map((a) => (
                  <div key={a.id} className={cx("check", a.done && "done")}>
                    <input
                      type="checkbox"
                      checked={a.done}
                      aria-label={`Mark "${a.text}" done`}
                      onChange={() => update((all) => all.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)))}
                    />
                    <div>
                      <div className="txt small">{a.text}</div>
                      {a.source && (
                        <div className="tiny" style={{ color: "var(--faint)", marginTop: 2 }}>
                          From: {a.source}
                        </div>
                      )}
                    </div>
                    <button className="icon-btn" aria-label="Delete action" onClick={() => update((all) => all.filter((x) => x.id !== a.id))}>
                      <IconX style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                ))}
                {!items.length && <div className="tiny muted" style={{ padding: "10px 0" }}>Nothing here.</div>}
              </div>
              <form
                className="row gap-8 mt-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = drafts[col.key].trim();
                  if (!text) return;
                  update((all) => [{ id: uid(), text, horizon: col.key, done: false, source: "", date: today() }, ...all]);
                  setDrafts((d) => ({ ...d, [col.key]: "" }));
                }}
              >
                <input
                  className="input"
                  style={{ padding: "7px 10px", fontSize: 13 }}
                  placeholder="Add…"
                  value={drafts[col.key]}
                  onChange={(e) => setDrafts((d) => ({ ...d, [col.key]: e.target.value }))}
                />
                <button className="btn sm" aria-label="Add action" disabled={!drafts[col.key].trim()}>
                  <IconPlus />
                </button>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}
