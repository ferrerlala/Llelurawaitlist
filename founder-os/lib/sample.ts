import type { Analysis, Brief, Portfolio } from "./schemas";
import { newCompany } from "./store";
import type { Company, Workspace } from "./types";
import { uid } from "./util";

/*
 * A fictional sample workspace so the product can be explored before the
 * engine is connected. All companies, numbers and analyses are invented.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const dayStr = (n: number) => daysAgo(n).slice(0, 10);

const sampleBrief: Brief = {
  readiness: {
    overall: 54,
    summary:
      "Real pain and early revenue, but distribution depends on the founder and the moat is still a promise. Integration depth is the lever that moves five dimensions at once.",
    dimensions: [
      { name: "Problem", score: 82, note: "Missed-visit coordination is a costly, daily, measurable pain." },
      { name: "Product", score: 61, note: "Scheduling assistant works; family updates are bolted on." },
      { name: "Customer", score: 66, note: "Mid-size agencies (80–400 aides) convert; small ones churn." },
      { name: "Revenue", score: 44, note: "$31k MRR across 14 agencies; concentration risk in top 3." },
      { name: "Distribution", score: 32, note: "Every deal is founder-sold; no repeatable channel yet." },
      { name: "Technology", score: 63, note: "Solid agent workflow core; two EHR integrations live." },
      { name: "AI Advantage", score: 57, note: "Rescheduling agent is good; data loop not yet compounding." },
      { name: "Moat", score: 35, note: "Copyable in six months without deeper EHR + payer data lock-in." },
      { name: "Operations", score: 52, note: "Onboarding takes 5 weeks; too manual to scale." },
      { name: "Capital", score: 48, note: "11 months runway at current burn." },
      { name: "Team", score: 58, note: "Strong technical founder; no clinical or sales leader yet." },
      { name: "Market", score: 71, note: "Home health is growing and short-staffed; timing is favorable." },
    ],
  },
  health: "STABLE",
  health_note: "Growing, funded for 11 months, but fragile on distribution and onboarding speed.",
  current_priority: "Cut onboarding from 5 weeks to 5 days by productizing the two EHR integrations.",
  biggest_opportunity:
    "Become the coordination layer for home health: every missed visit, reschedule and family update flows through Tandem.",
  biggest_risk: "EHR vendors ship a 'good enough' scheduling assistant inside the record system.",
  current_bottleneck: "Founder-led sales and a 5-week manual onboarding cap growth at ~2 agencies per month.",
  top_3_actions: [
    "Ship self-serve EHR connection for the two live integrations.",
    "Sign a referral partnership with one regional home-care association.",
    "Hire a clinical operations lead who has run a 200+ aide agency.",
  ],
  radar: [
    { category: "Opportunities", signal: "State Medicaid EVV mandates push agencies toward digital visit tracking", urgency: "now" },
    { category: "Risks", signal: "Top 3 agencies are 58% of MRR", urgency: "now" },
    { category: "Bottlenecks", signal: "Onboarding takes 5 weeks of founder time", urgency: "now" },
    { category: "Moats", signal: "Visit outcome data could train a no-show predictor competitors lack", urgency: "soon" },
    { category: "Customer Signals", signal: "Schedulers use the family update feature more than expected", urgency: "soon" },
    { category: "Competitive Moves", signal: "Large EHR vendor announced an 'AI assistant' roadmap item", urgency: "soon" },
    { category: "Technology Shifts", signal: "Voice agents now reliable enough for aide check-in calls", urgency: "watch" },
    { category: "Market Changes", signal: "Aide shortage worsening; agencies paying overtime premiums", urgency: "watch" },
  ],
  missing_information: [
    "Gross margin per agency after onboarding costs",
    "Logo churn over the last two quarters",
  ],
};

const sampleAnalysis: Analysis = {
  dimensions: [
    {
      dimension: "First Principles",
      headline: "The product is not scheduling; it is preventing missed visits.",
      insight:
        "Agencies lose revenue and risk patient harm on every missed visit. Scheduling is the mechanism, not the value. Framing it this way changes pricing, positioning and the data you collect.",
      signal: "strength",
    },
    {
      dimension: "Product",
      headline: "Onboarding is the product's worst feature.",
      insight:
        "Five weeks to value kills momentum and makes every deal founder-dependent. Users love the rescheduling agent once live; the problem is getting there.",
      signal: "concern",
    },
    {
      dimension: "Technology",
      headline: "Integrations should become infrastructure, not projects.",
      insight:
        "Each EHR connection is rebuilt per customer. Turning the two live integrations into self-serve connectors is the single change that compounds across onboarding, retention and moat.",
      signal: "concern",
    },
    {
      dimension: "Business",
      headline: "Price on missed visits prevented, not seats.",
      insight:
        "A missed visit costs an agency roughly $150–$250 in lost billing. Outcome-linked pricing makes ROI obvious and expands naturally with agency size.",
      signal: "neutral",
    },
    {
      dimension: "Customer",
      headline: "Mid-size agencies are the beachhead.",
      insight:
        "Agencies with 80–400 aides feel the pain and can pay; small agencies churn and enterprise chains want custom builds. Concentrate here.",
      signal: "strength",
    },
    {
      dimension: "Healthcare",
      headline: "Family updates touch PHI and need explicit consent flows.",
      insight:
        "Sending visit status to family members is a HIPAA disclosure. Build patient-authorized contacts and audit trails before scaling the feature.",
      signal: "critical",
    },
    {
      dimension: "Strategic",
      headline: "Don't compete with EHRs; become the layer they integrate with.",
      insight:
        "Fighting the record system for the scheduler's screen is a losing war. Owning cross-system coordination data is defensible.",
      signal: "neutral",
    },
    {
      dimension: "Risk",
      headline: "Distribution, not product, is the existential risk.",
      insight:
        "With 11 months of runway and two deals per month, the company runs out of time before it proves a channel.",
      signal: "critical",
    },
  ],
  ten_x: {
    more_valuable: "Predict which visits will be missed tomorrow and fix them tonight.",
    easier_to_use: "Connect the EHR in one click and go live the same day.",
    faster: "Reschedule in under 60 seconds with an agent that calls the aide and the family.",
    harder_to_copy: "A visit-outcome dataset across hundreds of agencies that trains the predictor.",
    serve_100x_customers: "Self-serve onboarding plus association-led distribution.",
    feature_to_platform: "Open the coordination engine to payers and hospitals for post-discharge visits.",
    company_to_category: "Define 'care continuity infrastructure' for home-based care.",
  },
  moat: {
    strength: "WEAK",
    six_month_copy_test:
      "Today, yes — a well-funded team could rebuild the scheduling assistant in six months. The defensible asset would be the cross-agency outcome data and integration depth, which don't exist at scale yet.",
    sources: [
      { type: "Proprietary data", assessment: "Visit outcomes across 14 agencies; too small to matter yet.", status: "buildable" },
      { type: "Integrations", assessment: "Two EHRs live; productized connectors would raise switching costs.", status: "buildable" },
      { type: "Workflow lock-in", assessment: "Schedulers run their day in Tandem once live.", status: "exists" },
      { type: "Network effects", assessment: "None today.", status: "absent" },
    ],
    how_to_strengthen:
      "Make integrations self-serve, then use the outcome data to ship a no-show predictor that gets better with every agency.",
  },
  killer_risks: [
    {
      risk: "Distribution never becomes repeatable before runway ends.",
      why_it_kills: "At two agencies per month the company can't reach a fundable growth rate in 11 months.",
      mitigation: "Test one association partnership in the next 30 days; measure qualified intros per month.",
    },
    {
      risk: "An EHR vendor bundles a comparable assistant.",
      why_it_kills: "Agencies default to what's inside their record system.",
      mitigation: "Become multi-EHR and own the cross-system outcome data the vendors can't see.",
    },
  ],
  synthesis: {
    best_opportunity: "Own coordination of every home-health visit across systems, priced on missed visits prevented.",
    biggest_problem: "Five-week manual onboarding that makes every deal founder-dependent.",
    best_product: "One-click EHR connection plus a rescheduling agent that prevents missed visits overnight.",
    best_business_model: "Per-agency platform fee plus a fee per missed visit prevented.",
    best_technology_approach: "Self-serve integration connectors feeding a shared outcome dataset and predictor.",
    biggest_competitive_advantage: "Cross-agency, cross-EHR visit outcome data.",
    biggest_risk: "Running out of runway before distribution becomes repeatable.",
    most_important_assumption: "Mid-size agencies will adopt without founder-led onboarding if integration is self-serve.",
    highest_leverage_action: "Productize the two live EHR integrations so a new agency can go live in five days.",
  },
  verdict: "PROMISING",
  verdict_rationale:
    "The pain is real and paid for, but the moat and distribution are unproven. It becomes STRONG when onboarding is self-serve and one channel delivers deals without the founder.",
  answer:
    "Don't raise yet. Spend the next 60 days making onboarding self-serve and proving one distribution channel — then raise on a growth curve instead of a story.",
  why: "Investors will price this round on founder-led sales and a 5-week onboarding. Fixing both moves the company from PROMISING to STRONG and the valuation with it. You have 11 months of runway, which is enough to do this first.",
  opportunity:
    "If integrations become self-serve, every new agency adds outcome data that makes the product better for all of them — the beginning of a real moat.",
  risk: "If the association channel fails, you will reach month 8 without a growth story. Set a hard checkpoint at day 45.",
  decision: "Delay the raise by 60 days and put all engineering on self-serve onboarding.",
  next_moves: [
    {
      move: "Productize the two live EHR integrations into self-serve connectors.",
      why: "Cuts onboarding from weeks to days and removes the founder from every deal.",
    },
    {
      move: "Pitch one regional home-care association on a member referral program.",
      why: "One partnership can deliver more qualified agencies than a quarter of founder outreach.",
    },
    {
      move: "Instrument missed-visits-prevented for every live agency.",
      why: "It becomes the pricing metric, the sales proof and the fundraising headline.",
    },
  ],
  challenges: [
    "You are trying to raise to solve a distribution problem money won't fix.",
    "Your moat is currently weak — the data advantage is still a plan.",
    "Family updates may be a HIPAA liability before they are a feature.",
  ],
  execution: {
    today: ["Block engineering roadmap for 6 weeks on self-serve onboarding."],
    this_week: [
      "Write the connector spec for both EHRs.",
      "Email three association directors.",
      "Add missed-visit tracking to the analytics dashboard.",
    ],
    this_month: ["Ship connector beta to two new agencies.", "Run the first association webinar."],
    next_90_days: ["New agencies live in ≤5 days.", "One channel producing 4+ qualified agencies/month.", "Raise on the new curve."],
  },
  radar: [
    { category: "Bottlenecks", signal: "Onboarding takes 5 weeks", urgency: "now" },
    { category: "Opportunities", signal: "Association referral channel untested", urgency: "now" },
    { category: "Moats", signal: "Outcome data could power a no-show predictor", urgency: "soon" },
  ],
  platform_alert: {
    detected: true,
    summary:
      "Tandem Care and Clearclaim both need EHR connectors, patient identity and HIPAA audit trails. Build the integration layer once and run both products on it.",
    shared_capabilities: ["EHR integrations", "Patient identity", "Audit trails", "Agent workflow engine"],
  },
  healthcare_considerations: [
    "Family visit updates are PHI disclosures; require patient-authorized contacts and log every message.",
    "Keep a human scheduler in the loop for clinical visit changes (e.g., wound care, medication administration).",
    "Sign BAAs with every sub-processor used by the rescheduling agent, including telephony.",
  ],
  learned_facts: [],
};

const samplePortfolio: Portfolio = {
  relationships: [
    {
      companies: ["Tandem Care", "Clearclaim"],
      relationship: "Same agencies, same EHRs, same patient records — one schedules visits, the other bills them.",
      strength: "strong",
    },
    {
      companies: ["Tandem Care", "Shiftwise"],
      relationship: "Missed visits are often staffing gaps; Shiftwise could fill what Tandem detects.",
      strength: "moderate",
    },
    {
      companies: ["Clearclaim", "Shiftwise"],
      relationship: "Little direct overlap beyond shared agency customers.",
      strength: "weak",
    },
  ],
  shared_capabilities: [
    { capability: "EHR integrations", used_by: ["Tandem Care", "Clearclaim"], build_once_note: "The most expensive thing you are building twice." },
    { capability: "Patient & caregiver identity", used_by: ["Tandem Care", "Clearclaim", "Shiftwise"], build_once_note: "One identity graph across visits, claims and shifts." },
    { capability: "Agent workflow engine", used_by: ["Tandem Care", "Clearclaim"], build_once_note: "Rescheduling and claim follow-up are the same agent pattern." },
    { capability: "HIPAA audit trails", used_by: ["Tandem Care", "Clearclaim", "Shiftwise"], build_once_note: "Compliance built once is a sales asset for all three." },
    { capability: "Agency billing & org management", used_by: ["Tandem Care", "Clearclaim", "Shiftwise"], build_once_note: "One account, one contract, three products." },
  ],
  structure_recommendation: "ONE PLATFORM, MULTIPLE PRODUCTS",
  recommendation_rationale:
    "These are not three companies; they are three applications on one home-health operating layer. Splitting them triples integration cost and divides a small team's attention.",
  core_platform: {
    name: "Tandem Platform",
    layers: ["Identity & organizations", "EHR + payer integrations", "Agent workflow engine", "Audit, security & compliance", "Analytics & outcome data"],
    products_on_top: ["Tandem Care (visit coordination)", "Clearclaim (billing)", "Shiftwise (staffing)"],
  },
  focus_call:
    "Tandem Care. It has revenue, the integrations and the data loop. Clearclaim should become its second product; pause Shiftwise.",
  next_3_moves: [
    "Extract the EHR integration layer from Tandem Care into a shared service.",
    "Run Clearclaim as a module for existing Tandem agencies instead of a separate sale.",
    "Pause Shiftwise until the platform has 50 agencies.",
  ],
};

export function sampleWorkspace(): Workspace {
  const tandem: Company = {
    ...newCompany("Tandem Care", {
      oneLiner: "AI care coordination that prevents missed home-health visits.",
      industry: "Healthcare · Home health",
      stage: "Seed · post-revenue",
      mission: "No patient misses care because a schedule broke.",
      vision: "The coordination layer for all home-based care.",
      products: "Rescheduling agent for schedulers; family visit updates; missed-visit analytics.",
      customers: "Home health agencies with 80–400 aides; buyer is the director of operations.",
      businessModel: "Annual SaaS subscription per agency.",
      revenue: "$31k MRR across 14 agencies, growing ~2 agencies/month.",
      pricing: "$1,800–$3,200 per agency per month, tiered by aide count.",
      technology: "Agent workflow engine; integrations with two home-health EHRs; telephony for aide calls.",
      competitors: "EHR-native scheduling modules; spreadsheets and phone trees; one funded point-solution startup.",
      goals: "Reach $100k MRR and raise a Series A within 12 months.",
      team: "Technical founder/CEO, 3 engineers, 1 implementation specialist.",
    }),
    createdAt: daysAgo(60),
  };
  tandem.metrics = [
    { id: uid(), label: "MRR", value: "$31k" },
    { id: uid(), label: "Agencies live", value: "14" },
    { id: uid(), label: "Onboarding time", value: "5 weeks" },
    { id: uid(), label: "Runway", value: "11 months" },
  ];
  tandem.decisions = [
    { id: uid(), date: dayStr(20), title: "Focus segment", decision: "Sell only to agencies with 80–400 aides.", rationale: "Small agencies churned at 3× the rate." },
    { id: uid(), date: dayStr(41), title: "Pricing model", decision: "Move from per-seat to per-agency tiers.", rationale: "Seat counts fluctuated with aide turnover." },
  ];
  tandem.experiments = [
    { id: uid(), date: dayStr(12), title: "Association webinar", hypothesis: "Associations can deliver qualified agencies.", metric: "Qualified intros · 30 days", status: "open", result: "" },
    { id: uid(), date: dayStr(35), title: "Family SMS updates", hypothesis: "Family updates reduce inbound calls to schedulers.", metric: "Inbound calls −20%", status: "won", result: "Inbound calls fell 27% at two agencies." },
  ];
  tandem.ideas = [
    { id: uid(), date: dayStr(5), text: "No-show predictor trained on visit outcome data" },
    { id: uid(), date: dayStr(9), text: "Voice agent for aide check-in calls" },
    { id: uid(), date: dayStr(16), text: "Post-discharge visit coordination for hospitals" },
  ];
  tandem.assumptions = [
    { id: uid(), date: dayStr(2), text: sampleAnalysis.synthesis.most_important_assumption, status: "untested" },
    { id: uid(), date: dayStr(30), text: "Directors of operations control the buying decision.", status: "validated" },
  ];
  tandem.actions = [
    { id: uid(), text: "Block engineering roadmap for 6 weeks on self-serve onboarding.", horizon: "today", done: false, source: "Should I raise money now?", date: dayStr(2) },
    { id: uid(), text: "Write the connector spec for both EHRs.", horizon: "week", done: false, source: "Should I raise money now?", date: dayStr(2) },
    { id: uid(), text: "Email three association directors.", horizon: "week", done: true, source: "Should I raise money now?", date: dayStr(2) },
    { id: uid(), text: "Ship connector beta to two new agencies.", horizon: "month", done: false, source: "Should I raise money now?", date: dayStr(2) },
    { id: uid(), text: "New agencies live in ≤5 days.", horizon: "quarter", done: false, source: "Should I raise money now?", date: dayStr(2) },
  ];
  tandem.sessions = [
    {
      id: uid(),
      date: daysAgo(2),
      mode: "think",
      input: "Should I raise money now? We have 11 months of runway and investors are reaching out.",
      result: sampleAnalysis,
    },
  ];
  tandem.brief = { ...sampleBrief, date: daysAgo(1) };
  tandem.readinessHistory = [
    { date: dayStr(50), score: 41 },
    { date: dayStr(36), score: 45 },
    { date: dayStr(22), score: 49 },
    { date: dayStr(8), score: 51 },
    { date: dayStr(1), score: 54 },
  ];

  const clearclaim = newCompany("Clearclaim", {
    oneLiner: "AI claim follow-up and prior authorization for small clinics.",
    industry: "Healthcare · Revenue cycle",
    stage: "Pre-revenue prototype",
    products: "Denial follow-up agent; prior-auth packet builder.",
    customers: "Independent clinics and home-health agencies.",
    technology: "Agent workflow engine; EHR integration; payer portal automation.",
    businessModel: "Percentage of recovered revenue.",
  });

  const shiftwise = newCompany("Shiftwise", {
    oneLiner: "On-demand staffing marketplace for home-care aides.",
    industry: "Healthcare · Workforce",
    stage: "Idea",
    products: "Shift marketplace; credential verification.",
    customers: "Home-care agencies and independent aides.",
    technology: "Marketplace app; credential checks.",
    businessModel: "Take rate per filled shift.",
  });

  return {
    version: 1,
    activeCompanyId: tandem.id,
    companies: [tandem, clearclaim, shiftwise],
    portfolio: { ...samplePortfolio, date: daysAgo(3) },
  };
}
