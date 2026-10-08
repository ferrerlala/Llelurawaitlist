import type { Analysis, Brief, MemoryField, Mode, Portfolio } from "./schemas";

export type Profile = Record<MemoryField, string> & { industry: string; oneLiner: string };

export interface Metric {
  id: string;
  label: string;
  value: string;
}

export interface DecisionRecord {
  id: string;
  date: string;
  title: string;
  decision: string;
  rationale: string;
}

export interface Experiment {
  id: string;
  date: string;
  title: string;
  hypothesis: string;
  metric: string;
  status: "open" | "won" | "lost" | "inconclusive";
  result: string;
}

export interface Idea {
  id: string;
  date: string;
  text: string;
}

export interface Assumption {
  id: string;
  date: string;
  text: string;
  status: "untested" | "validated" | "invalidated";
}

export type Horizon = "today" | "week" | "month" | "quarter";

export interface Action {
  id: string;
  text: string;
  horizon: Horizon;
  done: boolean;
  source: string;
  date: string;
}

export interface Session {
  id: string;
  date: string;
  mode: Mode;
  input: string;
  result: Analysis;
}

export interface Company {
  id: string;
  name: string;
  createdAt: string;
  profile: Profile;
  metrics: Metric[];
  decisions: DecisionRecord[];
  experiments: Experiment[];
  ideas: Idea[];
  assumptions: Assumption[];
  actions: Action[];
  sessions: Session[];
  brief: (Brief & { date: string }) | null;
  readinessHistory: { date: string; score: number }[];
}

export interface Workspace {
  version: 1;
  activeCompanyId: string | null;
  companies: Company[];
  portfolio: (Portfolio & { date: string }) | null;
}

/** The compact snapshot of memory the engine receives on every call. */
export interface CompanyContext {
  name: string;
  profile: Profile;
  metrics: { label: string; value: string }[];
  decisions: { date: string; title: string; decision: string }[];
  experiments: { title: string; status: string; result: string }[];
  assumptions: { text: string; status: string }[];
  ideas: string[];
  openActions: string[];
  recentQuestions: { date: string; mode: string; input: string; answer: string }[];
  readiness: number | null;
}

export interface PortfolioEntry {
  name: string;
  oneLiner: string;
  industry: string;
  products: string;
  customers: string;
  technology: string;
  businessModel: string;
}
