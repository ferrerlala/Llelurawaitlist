"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { callEngine, EngineError, toContext, toPortfolioEntry } from "./engine-client";
import type { Analysis, Brief, LearnedFactT, Mode, Portfolio } from "./schemas";
import type { Action, Company, Horizon, Profile, Session, Workspace } from "./types";
import { today, uid } from "./util";

const STORAGE_KEY = "founder-os:workspace:v1";

export const emptyProfile = (): Profile => ({
  oneLiner: "",
  industry: "",
  mission: "",
  vision: "",
  products: "",
  customers: "",
  businessModel: "",
  revenue: "",
  pricing: "",
  technology: "",
  competitors: "",
  goals: "",
  team: "",
  stage: "",
});

export function newCompany(name: string, profile: Partial<Profile> = {}): Company {
  return {
    id: uid(),
    name,
    createdAt: new Date().toISOString(),
    profile: { ...emptyProfile(), ...profile },
    metrics: [],
    decisions: [],
    experiments: [],
    ideas: [],
    assumptions: [],
    actions: [],
    sessions: [],
    brief: null,
    readinessHistory: [],
  };
}

const emptyWorkspace = (): Workspace => ({ version: 1, activeCompanyId: null, companies: [], portfolio: null });

export interface RunState {
  status: "idle" | "running" | "done" | "error";
  mode: Mode;
  input: string;
  companyId: string | null;
  phase: "connecting" | "thinking" | "writing";
  partial: string;
  sessionId: string | null;
  error: { message: string; code: string } | null;
  startedAt: number;
}

const idleRun: RunState = {
  status: "idle",
  mode: "think",
  input: "",
  companyId: null,
  phase: "connecting",
  partial: "",
  sessionId: null,
  error: null,
  startedAt: 0,
};

type TaskStatus = { running: boolean; error: string | null };

interface Store {
  hydrated: boolean;
  workspace: Workspace;
  company: Company | null;
  run: RunState;
  briefTask: TaskStatus;
  portfolioTask: TaskStatus;
  draft: { mode: Mode; input: string } | null;
  setDraft: (d: { mode: Mode; input: string } | null) => void;
  setActive: (id: string) => void;
  createCompany: (name: string, profile?: Partial<Profile>) => Company;
  deleteCompany: (id: string) => void;
  updateCompany: (id: string, fn: (c: Company) => Company) => void;
  replaceWorkspace: (w: Workspace) => void;
  runAnalysis: (mode: Mode, input: string) => Promise<void>;
  cancelRun: () => void;
  resetRun: () => void;
  refreshBrief: () => Promise<void>;
  runPortfolio: () => Promise<void>;
  logDecision: (session: Session) => void;
  commitPlan: (session: Session) => void;
  rememberFacts: (facts: LearnedFactT[]) => void;
  trackExperiment: (session: Session) => void;
}

const StoreContext = createContext<Store | null>(null);

function addActions(c: Company, items: { text: string; horizon: Horizon }[], source: string): Company {
  const existing = new Set(c.actions.map((a) => a.text.toLowerCase()));
  const fresh: Action[] = items
    .filter((i) => i.text && !existing.has(i.text.toLowerCase()))
    .map((i) => ({ id: uid(), text: i.text, horizon: i.horizon, done: false, source, date: today() }));
  return { ...c, actions: [...fresh, ...c.actions] };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [run, setRun] = useState<RunState>(idleRun);
  const [briefTask, setBriefTask] = useState<TaskStatus>({ running: false, error: null });
  const [portfolioTask, setPortfolioTask] = useState<TaskStatus>({ running: false, error: null });
  const [draft, setDraft] = useState<{ mode: Mode; input: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wsRef = useRef(workspace);
  wsRef.current = workspace;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Workspace;
        if (parsed?.version === 1) setWorkspace(parsed);
      }
    } catch {
      /* corrupted or unavailable storage: start fresh */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    } catch {
      /* storage full or unavailable */
    }
  }, [workspace, hydrated]);

  const company = useMemo(
    () => workspace.companies.find((c) => c.id === workspace.activeCompanyId) ?? workspace.companies[0] ?? null,
    [workspace],
  );

  const updateCompany = useCallback((id: string, fn: (c: Company) => Company) => {
    setWorkspace((w) => ({ ...w, companies: w.companies.map((c) => (c.id === id ? fn(c) : c)) }));
  }, []);

  const setActive = useCallback((id: string) => setWorkspace((w) => ({ ...w, activeCompanyId: id })), []);

  const createCompany = useCallback((name: string, profile: Partial<Profile> = {}) => {
    const c = newCompany(name, profile);
    setWorkspace((w) => ({ ...w, companies: [...w.companies, c], activeCompanyId: c.id }));
    return c;
  }, []);

  const deleteCompany = useCallback((id: string) => {
    setWorkspace((w) => {
      const companies = w.companies.filter((c) => c.id !== id);
      return {
        ...w,
        companies,
        activeCompanyId: w.activeCompanyId === id ? (companies[0]?.id ?? null) : w.activeCompanyId,
      };
    });
  }, []);

  const replaceWorkspace = useCallback((w: Workspace) => setWorkspace(w), []);

  const othersFor = (id: string | null) =>
    wsRef.current.companies.filter((c) => c.id !== id).map(toPortfolioEntry);

  const runAnalysis = useCallback(
    async (mode: Mode, input: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const active =
        wsRef.current.companies.find((c) => c.id === wsRef.current.activeCompanyId) ?? wsRef.current.companies[0];
      const companyId = active?.id ?? null;
      setRun({ ...idleRun, status: "running", mode, input, companyId, startedAt: Date.now() });

      try {
        const result = await callEngine<Analysis>(
          "/api/analyze",
          { mode, input, company: active ? toContext(active) : null, others: othersFor(companyId) },
          {
            onPhase: (phase) => setRun((r) => ({ ...r, phase })),
            onDelta: (text) => setRun((r) => ({ ...r, phase: "writing", partial: r.partial + text })),
          },
          controller.signal,
        );

        const session: Session = { id: uid(), date: new Date().toISOString(), mode, input, result };
        if (companyId) {
          updateCompany(companyId, (c) => {
            const assumption = result.synthesis.most_important_assumption.trim();
            const known = c.assumptions.some((a) => a.text.toLowerCase() === assumption.toLowerCase());
            return {
              ...c,
              sessions: [session, ...c.sessions].slice(0, 60),
              assumptions:
                assumption && !known
                  ? [{ id: uid(), date: today(), text: assumption, status: "untested" as const }, ...c.assumptions]
                  : c.assumptions,
            };
          });
        } else {
          // No company yet: hold the session on a scratch company so nothing is lost.
          const scratch = newCompany("My Company");
          scratch.sessions = [session];
          setWorkspace((w) => ({ ...w, companies: [...w.companies, scratch], activeCompanyId: scratch.id }));
        }
        setRun((r) => ({ ...r, status: "done", sessionId: session.id }));
      } catch (err) {
        if (controller.signal.aborted) return;
        const e = err instanceof EngineError ? err : new EngineError(String((err as Error)?.message ?? err));
        setRun((r) => ({ ...r, status: "error", error: { message: e.message, code: e.code } }));
      }
    },
    [updateCompany],
  );

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    setRun((r) => ({ ...r, status: "idle" }));
  }, []);

  const resetRun = useCallback(() => setRun(idleRun), []);

  const refreshBrief = useCallback(async () => {
    const active =
      wsRef.current.companies.find((c) => c.id === wsRef.current.activeCompanyId) ?? wsRef.current.companies[0];
    if (!active) return;
    setBriefTask({ running: true, error: null });
    try {
      const brief = await callEngine<Brief>("/api/brief", {
        company: toContext(active),
        others: othersFor(active.id),
      });
      updateCompany(active.id, (c) => ({
        ...c,
        brief: { ...brief, date: new Date().toISOString() },
        readinessHistory: [...c.readinessHistory, { date: today(), score: brief.readiness.overall }].slice(-24),
      }));
      setBriefTask({ running: false, error: null });
    } catch (err) {
      setBriefTask({ running: false, error: (err as Error).message });
    }
  }, [updateCompany]);

  const runPortfolio = useCallback(async () => {
    setPortfolioTask({ running: true, error: null });
    try {
      const portfolio = await callEngine<Portfolio>("/api/portfolio", {
        companies: wsRef.current.companies.map(toPortfolioEntry),
      });
      setWorkspace((w) => ({ ...w, portfolio: { ...portfolio, date: new Date().toISOString() } }));
      setPortfolioTask({ running: false, error: null });
    } catch (err) {
      setPortfolioTask({ running: false, error: (err as Error).message });
    }
  }, []);

  const withActive = (fn: (c: Company) => Company) => {
    const id = wsRef.current.activeCompanyId ?? wsRef.current.companies[0]?.id;
    if (id) updateCompany(id, fn);
  };

  const logDecision = (session: Session) =>
    withActive((c) =>
      c.decisions.some((d) => d.id === session.id)
        ? c
        : {
            ...c,
            decisions: [
              {
                id: session.id,
                date: today(),
                title: session.input.length > 90 ? session.input.slice(0, 87) + "…" : session.input,
                decision: session.result.decision,
                rationale: session.result.why,
              },
              ...c.decisions,
            ],
          },
    );

  const commitPlan = (session: Session) =>
    withActive((c) => {
      const ex = session.result.execution;
      return addActions(
        c,
        [
          ...ex.today.map((text) => ({ text, horizon: "today" as const })),
          ...ex.this_week.map((text) => ({ text, horizon: "week" as const })),
          ...ex.this_month.map((text) => ({ text, horizon: "month" as const })),
          ...ex.next_90_days.map((text) => ({ text, horizon: "quarter" as const })),
        ],
        session.input.slice(0, 80),
      );
    });

  const rememberFacts = (facts: LearnedFactT[]) =>
    withActive((c) => {
      const profile = { ...c.profile };
      for (const f of facts) {
        const current = profile[f.field]?.trim();
        profile[f.field] = current ? `${current}\n${f.value}` : f.value;
      }
      return { ...c, profile };
    });

  const trackExperiment = (session: Session) =>
    withActive((c) => {
      const g = session.result.grow?.next_growth_experiment;
      if (!g || c.experiments.some((e) => e.id === session.id)) return c;
      return {
        ...c,
        experiments: [
          {
            id: session.id,
            date: today(),
            title: g.test,
            hypothesis: g.hypothesis,
            metric: `${g.success_metric} · ${g.duration}`,
            status: "open",
            result: "",
          },
          ...c.experiments,
        ],
      };
    });

  const value: Store = {
    hydrated,
    workspace,
    company,
    run,
    briefTask,
    portfolioTask,
    draft,
    setDraft,
    setActive,
    createCompany,
    deleteCompany,
    updateCompany,
    replaceWorkspace,
    runAnalysis,
    cancelRun,
    resetRun,
    refreshBrief,
    runPortfolio,
    logDecision,
    commitPlan,
    rememberFacts,
    trackExperiment,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
