"use client";

import { useState } from "react";
import { RADAR_CATEGORIES, VERDICTS, type RadarSignalT, type Verdict } from "@/lib/schemas";
import { clamp, cx } from "@/lib/util";

export function scoreColor(score: number) {
  if (score >= 75) return "var(--good)";
  if (score >= 55) return "var(--accent)";
  if (score >= 35) return "var(--warn)";
  return "var(--bad)";
}

export function ScoreRing({ score, size = 132, label }: { score: number; size?: number; label?: string }) {
  const s = clamp(score);
  const stroke = Math.max(6, size * 0.06);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${label ?? "Score"}: ${s} of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={scoreColor(s)}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(c * s) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div className="serif" style={{ fontSize: size * 0.3, lineHeight: 1 }}>
            {s}
          </div>
          {label && (
            <div className="tiny muted" style={{ marginTop: 4, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {label}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const VERDICT_TONE: Record<Verdict, string> = {
  WEAK: "bad",
  PROMISING: "warn",
  STRONG: "info",
  "HIGH-POTENTIAL": "good",
  "CATEGORY-DEFINING": "accent",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span className={cx("badge", VERDICT_TONE[verdict] ?? "neutral")}>{verdict}</span>;
}

export function VerdictScale({ verdict }: { verdict: Verdict }) {
  const idx = VERDICTS.indexOf(verdict);
  const tone = VERDICT_TONE[verdict] ?? "neutral";
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
        {VERDICTS.map((v, i) => (
          <div
            key={v}
            style={{
              height: 5,
              borderRadius: 3,
              background: i <= idx ? `var(--${tone === "neutral" ? "line-strong" : tone})` : "var(--surface-3)",
              opacity: i <= idx ? 0.4 + (0.6 * (i + 1)) / (idx + 1) : 1,
            }}
          />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginTop: 6 }}>
        {VERDICTS.map((v, i) => (
          <div
            key={v}
            className="tiny"
            style={{
              color: i === idx ? "var(--text)" : "var(--faint)",
              fontSize: 10,
              letterSpacing: "0.06em",
              fontWeight: i === idx ? 600 : 400,
            }}
          >
            {v}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Twelve-axis spider chart for the Company Readiness Score. */
export function ReadinessRadar({ dims, size = 340 }: { dims: { name: string; score: number }[]; size?: number }) {
  const cx0 = size / 2;
  const cy0 = size / 2;
  const R = size / 2 - 48;
  const n = dims.length;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx0 + Math.cos(a) * R * (v / 100), cy0 + Math.sin(a) * R * (v / 100)] as const;
  };
  const poly = dims.map((d, i) => pt(i, clamp(d.score)).join(",")).join(" ");
  return (
    <svg viewBox={`-56 0 ${size + 112} ${size}`} width="100%" style={{ maxWidth: size + 112 }} role="img" aria-label="Readiness by dimension">
      {[25, 50, 75, 100].map((lvl) => (
        <polygon
          key={lvl}
          points={dims.map((_, i) => pt(i, lvl).join(",")).join(" ")}
          fill="none"
          stroke="var(--line)"
          strokeWidth={1}
        />
      ))}
      {dims.map((_, i) => {
        const [x, y] = pt(i, 100);
        return <line key={i} x1={cx0} y1={cy0} x2={x} y2={y} stroke="var(--line)" strokeWidth={1} />;
      })}
      <polygon points={poly} fill="rgba(214,183,122,0.16)" stroke="var(--accent)" strokeWidth={1.5} />
      {dims.map((d, i) => {
        const [x, y] = pt(i, clamp(d.score));
        return <circle key={d.name} cx={x} cy={y} r={2.6} fill="var(--accent)" />;
      })}
      {dims.map((d, i) => {
        const [x, y] = pt(i, 122);
        return (
          <text
            key={d.name}
            x={x}
            y={y}
            textAnchor={Math.abs(x - cx0) < 8 ? "middle" : x > cx0 ? "start" : "end"}
            dominantBaseline="middle"
            fill="var(--muted)"
            fontSize={10.5}
          >
            {d.name}
            <tspan fill="var(--text-2)" dx={4}>
              {clamp(d.score)}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

const URGENCY_RING = { now: 0.3, soon: 0.6, watch: 0.88 } as const;
const URGENCY_COLOR = { now: "var(--accent)", soon: "var(--info)", watch: "var(--faint)" } as const;

/** Radar scope: eight sectors, urgency as distance from the center (center = now). */
export function RadarScope({
  signals,
  size = 460,
  selected,
  onSelect,
}: {
  signals: (RadarSignalT & { id: string })[];
  size?: number;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const c = size / 2;
  const R = size / 2 - 56;
  const n = RADAR_CATEGORIES.length;
  const sector = (Math.PI * 2) / n;

  const placed = RADAR_CATEGORIES.flatMap((cat, ci) => {
    const inCat = signals.filter((s) => s.category === cat);
    return inCat.map((s, k) => {
      const a0 = ci * sector - Math.PI / 2;
      const a = a0 + (sector * (k + 1)) / (inCat.length + 1);
      const jitter = ((k % 3) - 1) * 0.05;
      const r = R * ((URGENCY_RING[s.urgency] ?? URGENCY_RING.watch) + jitter);
      return { ...s, x: c + Math.cos(a) * r, y: c + Math.sin(a) * r };
    });
  });

  return (
    <svg viewBox={`-80 0 ${size + 160} ${size}`} width="100%" style={{ maxWidth: size + 160 }} role="img" aria-label="Strategic radar">
      <defs>
        <radialGradient id="scopeGlow">
          <stop offset="0%" stopColor="rgba(214,183,122,0.14)" />
          <stop offset="100%" stopColor="rgba(214,183,122,0)" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={R} fill="url(#scopeGlow)" />
      {[0.45, 0.75, 1].map((f) => (
        <circle key={f} cx={c} cy={c} r={R * f} fill="none" stroke="var(--line)" strokeWidth={1} />
      ))}
      {RADAR_CATEGORIES.map((cat, i) => {
        const a = i * sector - Math.PI / 2;
        const mid = a + sector / 2;
        const lx = c + Math.cos(mid) * (R + 26);
        const ly = c + Math.sin(mid) * (R + 26);
        return (
          <g key={cat}>
            <line x1={c} y1={c} x2={c + Math.cos(a) * R} y2={c + Math.sin(a) * R} stroke="var(--line)" strokeWidth={1} />
            <text
              x={lx}
              y={ly}
              textAnchor={Math.abs(lx - c) < 10 ? "middle" : lx > c ? "start" : "end"}
              dominantBaseline="middle"
              fill="var(--muted)"
              fontSize={10.5}
              letterSpacing="0.06em"
            >
              {cat.toUpperCase()}
            </text>
          </g>
        );
      })}
      <text x={c} y={c - R * 0.45 + 12} textAnchor="middle" fill="var(--faint)" fontSize={9} letterSpacing="0.14em">
        NOW
      </text>
      <g style={{ transformOrigin: `${c}px ${c}px`, animation: "spin 9s linear infinite" }}>
        <path
          d={`M ${c} ${c} L ${c} ${c - R} A ${R} ${R} 0 0 1 ${c + R * Math.sin(0.5)} ${c - R * Math.cos(0.5)} Z`}
          fill="rgba(214,183,122,0.06)"
        />
      </g>
      {placed.map((p) => {
        const active = selected === p.id || hover === p.id;
        return (
          <g
            key={p.id}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(p.id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect?.(selected === p.id ? null : p.id)}
          >
            {p.urgency === "now" && (
              <circle cx={p.x} cy={p.y} r={11} fill="none" stroke="var(--accent)" strokeOpacity={0.35}>
                <animate attributeName="r" values="6;14;6" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="2.4s" repeatCount="indefinite" />
              </circle>
            )}
            <circle cx={p.x} cy={p.y} r={active ? 7 : 5} fill={URGENCY_COLOR[p.urgency] ?? URGENCY_COLOR.watch} stroke="var(--bg)" strokeWidth={2} />
          </g>
        );
      })}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

export function MiniBars({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = 100;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 28 }} aria-label="Readiness history">
      {values.slice(-12).map((v, i, arr) => (
        <div
          key={i}
          title={String(v)}
          style={{
            width: 6,
            height: `${Math.max(8, (v / max) * 100)}%`,
            borderRadius: 2,
            background: i === arr.length - 1 ? "var(--accent)" : "var(--surface-3)",
          }}
        />
      ))}
    </div>
  );
}
