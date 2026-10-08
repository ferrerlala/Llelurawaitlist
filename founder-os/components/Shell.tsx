"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getPasscode, setPasscode } from "@/lib/engine-client";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/util";
import { IconBolt, IconBook, IconBrain, IconHome, IconLayers, IconRadar } from "./Icons";

const NAV = [
  { href: "/", label: "Command Center", icon: IconHome },
  { href: "/brain", label: "CEO Brain", icon: IconBrain },
  { href: "/radar", label: "Strategic Radar", icon: IconRadar },
  { href: "/execution", label: "Execution", icon: IconBolt },
  { href: "/memory", label: "Company Memory", icon: IconBook },
  { href: "/portfolio", label: "Portfolio", icon: IconLayers },
];

type Health = { ready: boolean; model: string; passcode: boolean } | null;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, company, setActive, run, hydrated } = useStore();
  const [health, setHealth] = useState<Health>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: Health) => {
        setHealth(h);
        if (h?.passcode && !getPasscode()) setNeedsCode(true);
      })
      .catch(() => setHealth(null));
  }, []);

  const engineLabel = run.status === "running" ? "Engine running" : health?.ready ? "Engine ready" : "Engine offline";
  const dot = run.status === "running" ? "pulse" : health?.ready ? "on" : "off";

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">F</span>
          <span className="brand-name">FOUNDER OS</span>
        </Link>

        {hydrated && workspace.companies.length > 0 && (
          <div className="company-switch">
            <select
              aria-label="Active company"
              value={company?.id ?? ""}
              onChange={(e) => {
                if (e.target.value === "__new") router.push("/portfolio?new=1");
                else setActive(e.target.value);
              }}
            >
              {workspace.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new">+ New company…</option>
            </select>
          </div>
        )}

        <nav className="nav">
          <div className="nav-label">Workspace</div>
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cx(pathname === href && "active")}>
              <Icon />
              {label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div title={health?.model ? `Model: ${health.model}` : undefined}>
            <span className={cx("status-dot", dot)} />
            {engineLabel}
          </div>
          {health && !health.ready && (
            <div className="tiny">
              Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> to activate the engine.
            </div>
          )}
          {health?.passcode && (
            <button className="btn ghost sm" style={{ justifyContent: "flex-start", padding: 0 }} onClick={() => setNeedsCode(true)}>
              Passcode
            </button>
          )}
        </div>
      </aside>

      <main className="main">{children}</main>

      {needsCode && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,6,8,0.7)",
            display: "grid",
            placeItems: "center",
            zIndex: 40,
            backdropFilter: "blur(6px)",
          }}
        >
          <form
            className="card fade-in"
            style={{ width: 360 }}
            onSubmit={(e) => {
              e.preventDefault();
              setPasscode(code);
              setNeedsCode(false);
            }}
          >
            <div className="eyebrow">Protected workspace</div>
            <h2 className="title" style={{ fontSize: 24 }}>
              Enter passcode
            </h2>
            <p className="muted small">This Founder OS deployment requires a passcode to use the engine.</p>
            <input
              className="input mt-16"
              type="password"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Passcode"
            />
            <div className="row mt-16" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost" onClick={() => setNeedsCode(false)}>
                Later
              </button>
              <button className="btn primary">Unlock</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
