import { z } from "zod";
import { MODES } from "./schemas";

const s = z.string().max(4000).default("");

const Profile = z.object({
  oneLiner: s, industry: s, mission: s, vision: s, products: s, customers: s, businessModel: s,
  revenue: s, pricing: s, technology: s, competitors: s, goals: s, team: s, stage: s,
});

export const CompanyContextInput = z.object({
  name: z.string().max(200),
  profile: Profile,
  metrics: z.array(z.object({ label: s, value: s })).max(40).default([]),
  decisions: z.array(z.object({ date: s, title: s, decision: s })).max(40).default([]),
  experiments: z.array(z.object({ title: s, status: s, result: s })).max(40).default([]),
  assumptions: z.array(z.object({ text: s, status: s })).max(40).default([]),
  ideas: z.array(s).max(40).default([]),
  openActions: z.array(s).max(40).default([]),
  recentQuestions: z.array(z.object({ date: s, mode: s, input: s, answer: s })).max(10).default([]),
  readiness: z.number().nullable().default(null),
});

export const PortfolioEntryInput = z.object({
  name: z.string().max(200), oneLiner: s, industry: s, products: s, customers: s, technology: s, businessModel: s,
});

export const AnalyzeRequest = z.object({
  mode: z.enum(MODES),
  input: z.string().min(3).max(12000),
  company: CompanyContextInput.nullable(),
  others: z.array(PortfolioEntryInput).max(20).default([]),
});

export const BriefRequest = z.object({
  company: CompanyContextInput,
  others: z.array(PortfolioEntryInput).max(20).default([]),
});

export const PortfolioRequest = z.object({
  companies: z.array(PortfolioEntryInput).min(2).max(20),
});
