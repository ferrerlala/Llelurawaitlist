"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { RadarScope } from "@/components/Charts";
import { Onboarding } from "@/components/Onboarding";
import { RADAR_CATEGORIES, type RadarSignalT } from "@/lib/schemas";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/util";

const URGENCY_LABEL = { now: "Now", soon: "Soon", watch: "Watch" } as const;
const URGENCY_TONE = { now: "accent", soon: "info", watch: "neutral" } as const;

export default function RadarPage() {
  const router = useRouter();
  const { hydrated, company, setDraft, refreshBrief, briefTask } = useStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | RadarSignalT["urgency"]>("all");

  const signals = useMemo(() => {
    if (!company) return [];
    const seen = new Set<string>();
    const all: (RadarSignalT & { id: string; source: string })[] = [];
    const push = (s: RadarSignalT, source: string) => {
      const key = s.signal.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      all.push({ ...s, id: `${all.length}`, source });
    };
    company.brief?.radar.forEach((s) => push(s, "Brief"));
    company.sessions.slice(0, 3).forEach((sess) => sess.result.radar.forEach((s) => push(s, sess.input)));
    return all;
  }, [company]);

  if (!hydrated) return <div className="page" />;
  if (!company) return <Onboarding />;

  const visible = filter === "all" ? signals : signals.filter((s) => s.urgency === filter);
  const sel = signals.find((s) => s.id === selected) ?? null;

  const ask = (s: RadarSignalT) => {
    setDraft({
      mode: "think",
      input: `My strategic radar flags this (${s.category}, ${s.urgency}): "${s.signal}". What should I do about it?`,
    });
    router.push("/brain");
  };

  return (
    <div className="page">
      <div className="row between wrap gap-16" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Strategic radar · {company.name}</div>
          <h1 className="title" style={{ fontSize: 38 }}>
            What deserves your attention now
          </h1>
          <p className="subtitle">The center is now. The further out, the more time you have.</p>
        </div>
        <div className="segmented">
          {(["all", "now", "soon", "watch"] as const).map((f) => (
            <button key={f} className={cx(filter === f && "on")} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : URGENCY_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {signals.length === 0 ? (
        <div className="card empty mt-32">
          <p>The radar fills from your Command Center brief and CEO Brain sessions.</p>
          <button className="btn primary mt-16" onClick={refreshBrief} disabled={briefTask.running}>
            {briefTask.running ? "Scanning…" : "Scan my company"}
          </button>
        </div>
      ) : (
        <div className="grid g-radar mt-32">
          <div className="card" style={{ display: "grid", justifyItems: "center", alignContent: "start", padding: 16, alignSelf: "start", position: "relative" }}>
            <RadarScope signals={visible} selected={selected} onSelect={setSelected} />
            {sel ? (
              <div className="alert fade-in" style={{ width: "100%", marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <div className="row gap-8">
                    <span className="eyebrow">{sel.category}</span>
                    <span className={cx("badge", URGENCY_TONE[sel.urgency] ?? "neutral")}>{URGENCY_LABEL[sel.urgency]}</span>
                  </div>
                  <div className="mt-8">{sel.signal}</div>
                </div>
                <button className="btn sm" onClick={() => ask(sel)}>
                  Think about this
                </button>
              </div>
            ) : (
              <div className="tiny muted" style={{ marginTop: 8 }}>
                Select a signal to act on it.
              </div>
            )}
          </div>

          <div className="stack gap-12">
            {RADAR_CATEGORIES.map((cat) => {
              const items = visible.filter((s) => s.category === cat);
              if (!items.length) return null;
              return (
                <section key={cat} className="card" style={{ padding: "14px 18px" }}>
                  <div className="eyebrow">{cat}</div>
                  <ul className="list-clean mt-8">
                    {items.map((s) => (
                      <li key={s.id}>
                        <button
                          onClick={() => setSelected(s.id)}
                          className="row between gap-12"
                          style={{
                            width: "100%",
                            textAlign: "left",
                            background: "transparent",
                            border: 0,
                            cursor: "pointer",
                            padding: 0,
                            color: selected === s.id ? "var(--text)" : "var(--text-2)",
                          }}
                        >
                          <span className="small">{s.signal}</span>
                          <span className={cx("badge", URGENCY_TONE[s.urgency] ?? "neutral")} style={{ flex: "none" }}>
                            {URGENCY_LABEL[s.urgency]}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
