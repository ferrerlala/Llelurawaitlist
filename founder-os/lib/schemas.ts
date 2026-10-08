import { z } from "zod";

/*
 * Output contracts for the Founder Intelligence Engine.
 *
 * Every field is required (no optionals / nullables) so the structured-output
 * grammar stays small and the model always fills the full hierarchy. Field
 * order mirrors the engine pipeline: analysis -> synthesis -> decision -> action,
 * which also lets the client light up pipeline stages as keys stream in.
 */

export const MODES = ["think", "decide", "build", "grow", "opportunity", "challenge"] as const;
export type Mode = (typeof MODES)[number];

export const DIMENSIONS = [
  "First Principles",
  "Product",
  "Technology",
  "Business",
  "Investor",
  "Customer",
  "Operational",
  "Strategic",
  "Healthcare",
  "Risk",
  "Innovation",
] as const;

export const VERDICTS = ["WEAK", "PROMISING", "STRONG", "HIGH-POTENTIAL", "CATEGORY-DEFINING"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const RADAR_CATEGORIES = [
  "Opportunities",
  "Risks",
  "Moats",
  "Bottlenecks",
  "Customer Signals",
  "Competitive Moves",
  "Technology Shifts",
  "Market Changes",
] as const;
export type RadarCategory = (typeof RADAR_CATEGORIES)[number];

export const URGENCY = ["now", "soon", "watch"] as const;

/** Company memory fields the engine is allowed to propose updates for. */
export const MEMORY_FIELDS = [
  "mission",
  "vision",
  "products",
  "customers",
  "businessModel",
  "revenue",
  "pricing",
  "technology",
  "competitors",
  "goals",
  "team",
  "stage",
] as const;
export type MemoryField = (typeof MEMORY_FIELDS)[number];

const Dimension = z.object({
  dimension: z.enum(DIMENSIONS),
  headline: z.string().describe("One sharp sentence: the single most important finding through this lens."),
  insight: z.string().describe("2-4 sentences of reasoning. Concrete, specific to this company, no filler."),
  signal: z.enum(["strength", "neutral", "concern", "critical"]),
});

const KillerRisk = z.object({
  risk: z.string(),
  why_it_kills: z.string(),
  mitigation: z.string().describe("The cheapest, fastest way to retire or test this risk."),
});

const Synthesis = z.object({
  best_opportunity: z.string(),
  biggest_problem: z.string(),
  best_product: z.string(),
  best_business_model: z.string(),
  best_technology_approach: z.string(),
  biggest_competitive_advantage: z.string(),
  biggest_risk: z.string(),
  most_important_assumption: z.string(),
  highest_leverage_action: z.string(),
});

const TenX = z.object({
  more_valuable: z.string(),
  easier_to_use: z.string(),
  faster: z.string(),
  harder_to_copy: z.string(),
  serve_100x_customers: z.string(),
  feature_to_platform: z.string(),
  company_to_category: z.string(),
});

const Moat = z.object({
  strength: z.enum(["NONE", "WEAK", "MODERATE", "STRONG"]),
  six_month_copy_test: z
    .string()
    .describe("Direct answer to: why can't another company copy this in six months? Say plainly if it can."),
  sources: z.array(
    z.object({
      type: z.string().describe("e.g. Proprietary data, Workflow lock-in, Network effects, Regulatory expertise"),
      assessment: z.string(),
      status: z.enum(["exists", "buildable", "absent"]),
    }),
  ),
  how_to_strengthen: z.string(),
});

const RadarSignal = z.object({
  category: z.enum(RADAR_CATEGORIES),
  signal: z.string().describe("Short, specific signal (max ~14 words)."),
  urgency: z.enum(URGENCY),
});

const PlatformAlert = z.object({
  detected: z.boolean(),
  summary: z.string().describe("If detected: what should be built once and shared. If not: empty string."),
  shared_capabilities: z.array(z.string()),
});

const LearnedFact = z.object({
  field: z.enum(MEMORY_FIELDS),
  value: z.string().describe("A concise statement of the fact the founder revealed, written for the company record."),
});

const Move = z.object({
  move: z.string().describe("Imperative, specific action."),
  why: z.string().describe("Why this move has outsized leverage."),
});

const Execution = z.object({
  today: z.array(z.string()).describe("1-2 actions doable today."),
  this_week: z.array(z.string()).describe("At most 3."),
  this_month: z.array(z.string()).describe("At most 3."),
  next_90_days: z.array(z.string()).describe("At most 3 outcomes/milestones."),
});

/** The core analysis every mode produces. */
const coreShape = {
  dimensions: z.array(Dimension).describe("One entry per relevant lens. Include Healthcare only if relevant."),
  ten_x: TenX,
  moat: Moat,
  killer_risks: z.array(KillerRisk).describe("Only the 1-3 risks that could actually kill this."),
  synthesis: Synthesis,
  verdict: z.enum(VERDICTS),
  verdict_rationale: z.string(),
  answer: z.string().describe("THE ANSWER. 1-3 sentences. Lead with the conclusion."),
  why: z.string().describe("THE WHY. 2-4 sentences."),
  opportunity: z.string().describe("THE OPPORTUNITY. 1-3 sentences."),
  risk: z.string().describe("THE RISK. 1-3 sentences."),
  decision: z.string().describe("THE DECISION. One clear decision statement."),
  next_moves: z.array(Move).describe("Exactly 3 moves, highest leverage first."),
  challenges: z.array(z.string()).describe("2-5 respectful but direct challenges to the founder's assumptions."),
  execution: Execution,
  radar: z.array(RadarSignal).describe("4-10 signals that deserve the founder's attention."),
  platform_alert: PlatformAlert,
  healthcare_considerations: z
    .array(z.string())
    .describe("Regulatory/clinical/operational realities if healthcare-related; otherwise empty."),
  learned_facts: z
    .array(LearnedFact)
    .describe("New facts about the company revealed in the founder's input that are not already in memory."),
};

const Criterion = z.object({
  criterion: z.string(),
  scores: z.array(z.number()).describe("One 1-10 score per option, in option order."),
  note: z.string(),
});

const Decide = z.object({
  options: z.array(z.string()).describe("Short names for each option, in order."),
  criteria: z
    .array(Criterion)
    .describe(
      "Exactly these criteria: Strategic value, Revenue potential, Cost, Speed, Risk, Customer value, Defensibility, Scalability, Long-term potential. For Cost and Risk, higher score = better (cheaper / safer).",
    ),
  recommendation: z.string(),
  why: z.string(),
  what_i_would_do: z.string(),
  what_i_would_not_do: z.string(),
  next_action: z.string(),
});

const Build = z.object({
  problem: z.string(),
  target_customer: z.string(),
  solution: z.string(),
  core_workflow: z.array(z.string()).describe("The core user workflow as ordered steps."),
  ai_opportunities: z.array(z.string()),
  technical_architecture: z.string(),
  mvp: z.string(),
  must_have_features: z.array(z.string()),
  features_to_avoid: z.array(z.string()),
  business_model: z.string(),
  pricing_hypothesis: z.string(),
  validation_strategy: z.string(),
  first_customer: z.string(),
  success_metrics: z.array(z.string()),
  next_3_actions: z.array(z.string()),
});

const Grow = z.object({
  biggest_bottleneck: z.string(),
  growth_opportunity: z.string(),
  best_acquisition_channel: z.string(),
  best_customer_segment: z.string(),
  pricing_opportunity: z.string(),
  expansion_opportunity: z.string(),
  partnership_opportunity: z.string(),
  next_growth_experiment: z.object({
    hypothesis: z.string(),
    test: z.string(),
    success_metric: z.string(),
    duration: z.string(),
  }),
});

const Opportunity = z.object({
  score: z.number().describe("0-100. Calibrated: 50 is an average venture idea, 80+ is rare."),
  score_explanation: z.string().describe("Explain the score simply, in 2-3 sentences."),
  is_real: z.string(),
  how_large: z.string(),
  who_needs_it: z.string(),
  who_pays: z.string(),
  why_now: z.string(),
  competition: z.string(),
  technology_advantage: z.string(),
  market_timing: z.string(),
  potential_moat: z.string(),
  potential_category: z.string(),
});

export const AnalysisSchemas = {
  think: z.object(coreShape),
  challenge: z.object(coreShape),
  decide: z.object({ decide: Decide, ...coreShape }),
  build: z.object({ build: Build, ...coreShape }),
  grow: z.object({ grow: Grow, ...coreShape }),
  opportunity: z.object({ opportunity_scan: Opportunity, ...coreShape }),
} satisfies Record<Mode, z.ZodType>;

export type CoreAnalysis = z.infer<(typeof AnalysisSchemas)["think"]>;
export type DecideBlock = z.infer<typeof Decide>;
export type BuildBlock = z.infer<typeof Build>;
export type GrowBlock = z.infer<typeof Grow>;
export type OpportunityBlock = z.infer<typeof Opportunity>;
export type Analysis = CoreAnalysis & {
  decide?: DecideBlock;
  build?: BuildBlock;
  grow?: GrowBlock;
  opportunity_scan?: OpportunityBlock;
};
export type RadarSignalT = z.infer<typeof RadarSignal>;
export type LearnedFactT = z.infer<typeof LearnedFact>;

/* ------------------------------------------------------------------ */
/* Command Center brief: readiness score + dashboard state              */
/* ------------------------------------------------------------------ */

export const READINESS_DIMENSIONS = [
  "Problem",
  "Product",
  "Customer",
  "Revenue",
  "Distribution",
  "Technology",
  "AI Advantage",
  "Moat",
  "Operations",
  "Capital",
  "Team",
  "Market",
] as const;

export const BriefSchema = z.object({
  readiness: z.object({
    dimensions: z.array(
      z.object({
        name: z.enum(READINESS_DIMENSIONS),
        score: z.number().describe("0-100, calibrated and honest. Unknown = low, not average."),
        note: z.string().describe("One short sentence."),
      }),
    ),
    overall: z.number().describe("0-100 weighted overall readiness."),
    summary: z.string(),
  }),
  health: z.enum(["CRITICAL", "FRAGILE", "STABLE", "STRONG", "EXCEPTIONAL"]),
  health_note: z.string(),
  current_priority: z.string(),
  biggest_opportunity: z.string(),
  biggest_risk: z.string(),
  current_bottleneck: z.string(),
  top_3_actions: z.array(z.string()),
  radar: z.array(RadarSignal),
  missing_information: z
    .array(z.string())
    .describe("At most 3 facts whose absence most limits the quality of advice. Empty if none."),
});
export type Brief = z.infer<typeof BriefSchema>;

/* ------------------------------------------------------------------ */
/* Portfolio intelligence: relationships between companies              */
/* ------------------------------------------------------------------ */

export const PortfolioSchema = z.object({
  relationships: z.array(
    z.object({
      companies: z.array(z.string()),
      relationship: z.string(),
      strength: z.enum(["weak", "moderate", "strong"]),
    }),
  ),
  shared_capabilities: z.array(
    z.object({
      capability: z.string().describe("e.g. Identity, Data, AI/agents, Workflow engine, Billing, Audit trails"),
      used_by: z.array(z.string()),
      build_once_note: z.string(),
    }),
  ),
  structure_recommendation: z.enum([
    "KEEP SEPARATE",
    "SHARED INFRASTRUCTURE",
    "ONE PLATFORM, MULTIPLE PRODUCTS",
    "MERGE",
  ]),
  recommendation_rationale: z.string(),
  core_platform: z.object({
    name: z.string().describe("A working name for the shared core, or empty if KEEP SEPARATE."),
    layers: z.array(z.string()).describe("The shared platform layers, bottom-up."),
    products_on_top: z.array(z.string()),
  }),
  focus_call: z.string().describe("Which company deserves the founder's primary attention right now, and why."),
  next_3_moves: z.array(z.string()),
});
export type Portfolio = z.infer<typeof PortfolioSchema>;
