import type { Brief, Portfolio } from "./schemas";
import { newCompany } from "./store";
import type { Company, Workspace } from "./types";
import { today, uid } from "./util";

/*
 * The founder's real portfolio: HAOI (shared platform), Banlu, Elleah Health
 * and Cumpliva. Profiles are drawn only from the products' own prototype pages;
 * anything not stated there is left blank so the engine treats it as unknown.
 * The briefs and portfolio analysis are an initial read, meant to be refreshed
 * by the live engine.
 */

const now = () => new Date().toISOString();

function haoi(): Company {
  const c = newCompany("HAOI", {
    oneLiner: "Shared platform under Banlu, Elleah and Cumpliva: Banlu moves it, Elleah organizes it, Cumpliva checks it, Command Center sees all of it.",
    industry: "Healthcare · Care coordination infrastructure",
    stage: "Working prototype (multi-product demo with scenarios)",
    mission: "One operating layer for home- and community-based care, where every handoff between people, products and vendors is recorded and verified.",
    vision: "Care organizations run moving, organizing and checking on one platform instead of disconnected tools.",
    products:
      "Banlu (logistics / mobility), Elleah (case management), Cumpliva (verification & compliance), HAOI Command Center (enterprise view and assistant).",
    customers:
      "Health systems and home care agencies (demo orgs: a health system and a home care agency) with roles from case manager and dispatcher to supervisor, billing and executive.",
    businessModel: "Organizations subscribe per product; the platform meters events and AI calls per org and product.",
    technology:
      "Multi-tenant identity, organizations and memberships; role permissions with PHI-scoped reads per product; event bus with subscribers; workflow engine with tasks, deadlines and required evidence; automation rules; AI recommendations that act only after a human approves; immutable audit trail; usage metering; mobility layer with adapters for human couriers, transport companies, autonomous vehicles, hospital robots and drones.",
    goals: "",
    team: "Founder-built.",
  });
  c.ideas = [
    { id: uid(), date: today(), text: "ASAP ↔ agency coordination network for Massachusetts (agencies and ASAP care managers on one record)" },
    { id: uid(), date: today(), text: "Command Center assistant that answers operational questions across all three products" },
  ];
  c.assumptions = [
    { id: uid(), date: today(), text: "Buyers will want more than one product from the same platform.", status: "untested" },
    { id: uid(), date: today(), text: "Cross-product verification (Cumpliva checking Banlu and Elleah events) is valuable enough to pay for.", status: "untested" },
  ];
  c.decisions = [
    {
      id: uid(),
      date: today(),
      title: "AI governance",
      decision: "AI can only recommend; every AI action requires a human approval and is recorded as such in the audit trail.",
      rationale: "Stated platform rule in the HAOI prototype.",
    },
  ];
  return c;
}

function banlu(): Company {
  const c = newCompany("Banlu", {
    oneLiner: "Relay logistics for long-distance healthcare freight: two drivers share one route and hand off the load at a recorded midpoint.",
    industry: "Logistics · Healthcare equipment",
    stage: "Prototype testing & validation (working mobile prototype with connected backend)",
    mission: "Move loads that are too large, critical or complex for last-mile services, with a recorded handoff at every transfer.",
    vision: "A scalable driver network wherever two drivers work opposite ends of the same lane.",
    products:
      "Sender posting and dashboard; driver matching; Transfer Hub for verified midpoint handoffs; live GPS for both drivers; return routing; in-app messaging; B2B org billing.",
    customers:
      "Hospital networks, pharmacy chains, freight & logistics ops, elder care orgs, home health and medical couriers. Loads: hospital beds, oxygen, wheelchairs, medical supplies, diagnostic equipment, medication (incl. cold-chain), IV equipment.",
    businessModel: "Per-delivery billing (not per mile) for organization accounts; Pilot → Organization (multi-seat) → Enterprise (custom volume).",
    pricing: "Rates in validation against corridor testing; quoted per engagement.",
    technology: "Mobile prototype with connected backend; Transfer Hub custody record (equipment check, both driver IDs, transfer photo); dual live GPS.",
    revenue: "Pre-revenue.",
    goals: "Validate the relay outside the demo: drivers reliably meet and transfer, economics work for both drivers, senders trust a mid-route handoff. Then widen beyond one corridor.",
    team: "Founder-built.",
  });
  c.metrics = [
    { id: uid(), label: "End-to-end relays", value: "1 (Aug 2026)" },
    { id: uid(), label: "Corridors in test", value: "1 · Boston ↔ NY" },
    { id: uid(), label: "Modeled miles / driver", value: "~100 vs ~430" },
  ];
  c.assumptions = [
    { id: uid(), date: today(), text: "Drivers on opposite ends of a corridor will reliably meet and transfer a load.", status: "untested" },
    { id: uid(), date: today(), text: "The relay economics work for both drivers.", status: "untested" },
    { id: uid(), date: today(), text: "Senders will trust a delivery that changes hands mid-route.", status: "untested" },
  ];
  c.decisions = [
    { id: uid(), date: today(), title: "Beachhead load", decision: "Start with healthcare equipment; apply the same model to general B2B freight later.", rationale: "Stated positioning." },
    { id: uid(), date: today(), title: "Pricing unit", decision: "Bill per delivery, not per mile.", rationale: "Keeps costs predictable for procurement teams." },
  ];
  c.experiments = [
    {
      id: uid(),
      date: today(),
      title: "Boston → Brooklyn relay, handoff in Connecticut",
      hypothesis: "Two drivers can complete a relay end to end through the Transfer Hub.",
      metric: "Completed relay with confirmed handoff",
      status: "won",
      result: "Completed Aug 2026; surfaced a technical issue not visible in design review.",
    },
    {
      id: uid(),
      date: today(),
      title: "Corridor validation with drivers",
      hypothesis: "Repeated relays on one corridor hold up on reliability and driver economics.",
      metric: "Relays completed on schedule; driver earnings per leg",
      status: "open",
      result: "",
    },
  ];
  return c;
}

function elleah(): Company {
  const c = newCompany("Elleah Health", {
    oneLiner: "Built by a case manager to close the gaps older adults fall through between hospital, home and family.",
    industry: "Healthcare · Elder care & case management",
    stage: "Prototype across three doors",
    mission: "Older adults should not fall through the gaps between hospital, home and family.",
    vision: "One case record and one follow-up engine, used three ways.",
    products:
      "Case Desk for agencies (QA-aware documentation, follow-up and audit trail); Elleah for Families (guides, care binder, async expert consults with a numbered plan); Advisory (hospital and investor engagements).",
    customers:
      "Elder services agencies and their case managers; family caregivers of older adults in Massachusetts; hospitals (discharge transitions, documentation QA); investors and deal teams in aging and home-based care.",
    businessModel:
      "Case Desk: software subscription per case manager. Families: monthly membership plus single consults. Advisory: fixed-fee engagements, sessions and retainers.",
    pricing:
      "Families: Guide free, Pocket $29/mo (2 consults, 72h), Partner $79/mo (6 consults, 24h), single consult $49. Advisory catalog (draft placeholders): Case Desk pilot $2,500/mo for 90 days, expert call $350/hr, MA market briefing $4,000, documentation QA audit $8,500, discharge-transitions review $12,000, advisory retainer $2,000/mo.",
    technology:
      "Shared case record and follow-up engine; verification states on every fact (verified / reported / pending / unknown); AI-drafted documentation with strict no-new-facts rules and human sign-off.",
    revenue: "Pre-revenue.",
    goals: "First paid advisory engagements; family beta; an agency or hospital pilot of Case Desk.",
    team: "Founder: Certified Case Manager (CCM) in Massachusetts; behavioral health and medical interpreting certifications; bilingual English/Spanish.",
  });
  c.metrics = [
    { id: uid(), label: "Pocket plan", value: "$29/mo" },
    { id: uid(), label: "Partner plan", value: "$79/mo" },
    { id: uid(), label: "Single consult", value: "$49" },
  ];
  c.assumptions = [
    { id: uid(), date: today(), text: "Families will pay monthly for async expert consults after the crisis passes.", status: "untested" },
    { id: uid(), date: today(), text: "Case managers at elder services agencies will adopt a mobile tool to document home visits.", status: "untested" },
    { id: uid(), date: today(), text: "Hospitals and investors will pay for operator expertise from a practicing case manager.", status: "untested" },
  ];
  c.decisions = [
    {
      id: uid(),
      date: today(),
      title: "Consulting boundary",
      decision: "Keep consulting separate from the agency job: own time, own devices, no agency clients or data.",
      rationale: "Stated rule in the advisory workspace.",
    },
  ];
  return c;
}

function cumpliva(): Company {
  const c = newCompany("Cumpliva", {
    oneLiner: "Resolution Center for licensed home care agencies that contract with ASAPs: every worker, billing, ASAP and elder issue becomes one case with its evidence.",
    industry: "Healthcare · Home care operations & compliance",
    stage: "Working prototype",
    mission: "Every issue gets evidence, communication, action, a follow-up date and a documented resolution, and discrepancies are never labeled as fraud.",
    vision: "",
    products:
      "Case resolution (Problem → Evidence → Communication → Action → Follow-up → Resolution); pre-invoice visit reconciliation (authorization, schedule, EVV, visit note, timesheet, elder check-in, invoice line); recurring-issue detection; ASAP portal; worker compliance (CORI, exclusion screening, training, supervisory visits); new-hire 90-day program; referral fit checks; worker app and elder IVR/SMS check-ins.",
    customers:
      "Massachusetts licensed home care agencies that contract with ASAPs and SCO plans. Users: owner/administrator, coordinators, RN supervisors, billing; ASAP care managers via portal.",
    businessModel: "",
    pricing: "",
    technology:
      "Works alongside EVV, scheduling, payroll and billing (not an EVV replacement, not surveillance). File import today, API connectors per system. Org-isolated data; ASAP users see only their own clients and never internal notes. AI drafting reviewed by staff.",
    competitors: "Status quo: scattered inboxes, phone notes and spreadsheets beside existing EVV and billing systems.",
    revenue: "Pre-revenue.",
    goals: "",
    team: "Founder-built.",
  });
  c.assumptions = [
    { id: uid(), date: today(), text: "Agency owners will pay to catch EVV/timesheet/authorization mismatches before invoicing.", status: "untested" },
    { id: uid(), date: today(), text: "The new MA home care licensing law creates urgent demand for compliance tracking.", status: "untested" },
    { id: uid(), date: today(), text: "ASAP care managers will use an agency-provided portal.", status: "untested" },
  ];
  c.decisions = [
    {
      id: uid(),
      date: today(),
      title: "Positioning",
      decision: "Complement EVV, scheduling and billing systems rather than replace them; never label discrepancies as fraud.",
      rationale: "Stated product principles.",
    },
  ];
  c.ideas = [{ id: uid(), date: today(), text: "Turnover analytics from exit reasons and the 90-day new-hire program" }];
  return c;
}

/* ---------------- Initial briefs (to be refreshed by the engine) ---------------- */

const briefs: Record<string, Brief> = {
  Cumpliva: {
    readiness: {
      overall: 41,
      summary:
        "The sharpest problem and the clearest buyer in the portfolio, with a regulatory reason to act now. Nothing is validated with a paying agency yet.",
      dimensions: [
        { name: "Problem", score: 72, note: "Billing mismatches and unresolved complaints cost agencies money and ASAP trust." },
        { name: "Product", score: 62, note: "Deep, specific prototype covering the full resolution loop." },
        { name: "Customer", score: 48, note: "Clear buyer (agency owner); no agency has used it yet." },
        { name: "Revenue", score: 8, note: "Pre-revenue; pricing not yet defined." },
        { name: "Distribution", score: 30, note: "Founder knows the MA ASAP network; no channel tested." },
        { name: "Technology", score: 52, note: "File import works; integrations per EVV system still to build." },
        { name: "AI Advantage", score: 40, note: "Drafting and pattern detection help; not yet a moat." },
        { name: "Moat", score: 32, note: "MA-specific workflow and ASAP portal could compound." },
        { name: "Operations", score: 30, note: "Solo founder; onboarding and support not designed." },
        { name: "Capital", score: 20, note: "Unknown; assumed bootstrapped." },
        { name: "Team", score: 45, note: "Strong domain depth; no technical or sales co-founder documented." },
        { name: "Market", score: 60, note: "New MA licensing law (signed 08/07/2026) adds inspections and complaint investigations." },
      ],
    },
    health: "FRAGILE",
    health_note: "A strong product shape without a customer conversation on record.",
    current_priority: "Get written conflict-of-interest clearance before showing Cumpliva to any agency.",
    biggest_opportunity: "Become the system of record between agencies and ASAPs as the new licensing law raises the cost of sloppy compliance.",
    biggest_risk:
      "Your employer's conflict-of-interest policy: agencies that contract with your ASAP are its vendors, and you may make referral or complaint decisions about them.",
    current_bottleneck: "Employer clearance, then pricing and a pilot customer.",
    top_3_actions: [
      "Send the written conflict-of-interest disclosure to your supervisor and HR.",
      "Define a pilot price (per agency per month) and a 60-day success metric, without contacting agencies yet.",
      "Once cleared, demo only to agencies outside your employer's network and service area.",
    ],
    radar: [
      { category: "Market Changes", signal: "MA home care licensing law signed 08/07/2026: inspections and complaint investigations", urgency: "now" },
      { category: "Opportunities", signal: "Pre-invoice reconciliation recovers money agencies would otherwise lose or repay", urgency: "now" },
      { category: "Risks", signal: "Selling to your employer's contracted agencies is a likely conflict of interest", urgency: "now" },
      { category: "Bottlenecks", signal: "No pricing or pilot terms defined", urgency: "soon" },
      { category: "Competitive Moves", signal: "EVV vendors could add reconciliation features", urgency: "soon" },
      { category: "Moats", signal: "ASAP portal links agencies and care managers on one record", urgency: "soon" },
    ],
    missing_information: ["Pricing hypothesis", "Number of licensed agencies in the target region", "Any agency that has seen the prototype"],
  },
  "Elleah Health": {
    readiness: {
      overall: 38,
      summary:
        "Deep founder-market fit and three ways to earn money, but three doors split one founder's time. Advisory is the fastest path to revenue.",
      dimensions: [
        { name: "Problem", score: 74, note: "Families and agencies lose track of calls, deadlines and benefits during care crises." },
        { name: "Product", score: 55, note: "Three products prototyped; none in a customer's hands." },
        { name: "Customer", score: 42, note: "Three different buyers: agencies, families and hospitals/investors." },
        { name: "Revenue", score: 10, note: "Pre-revenue; family and advisory prices drafted." },
        { name: "Distribution", score: 30, note: "Personal network for advisory; B2C family acquisition untested." },
        { name: "Technology", score: 50, note: "Case record, follow-up engine, verification states." },
        { name: "AI Advantage", score: 45, note: "Strict no-new-facts drafting is a real trust feature." },
        { name: "Moat", score: 35, note: "Expertise and MA program knowledge; hard to scale beyond the founder." },
        { name: "Operations", score: 28, note: "Consult SLAs depend on one person." },
        { name: "Capital", score: 20, note: "Unknown; assumed bootstrapped." },
        { name: "Team", score: 55, note: "CCM, bilingual, practicing; single person." },
        { name: "Market", score: 58, note: "Aging population; MA programs are complex." },
      ],
    },
    health: "FRAGILE",
    health_note: "Credible founder and real pain; focus is the constraint.",
    current_priority: "Land the first paid advisory engagement while running a small family beta.",
    biggest_opportunity: "Founder expertise funds the company now, and every consult adds to a playbook that powers the software later.",
    biggest_risk: "Three doors and a day job leave no door finished.",
    current_bottleneck: "Founder time.",
    top_3_actions: [
      "Include Elleah in your conflict-of-interest disclosure and ask specifically about advisory and family consults.",
      "Pick one investor-side advisory offer (lowest conflict) and pitch it to five contacts outside your employer's network.",
      "Exclude your employer's consumers and their families from any family beta.",
    ],
    radar: [
      { category: "Opportunities", signal: "Advisory is the fastest path to first revenue", urgency: "now" },
      { category: "Risks", signal: "Employment and conflict-of-interest boundaries with the agency job", urgency: "now" },
      { category: "Bottlenecks", signal: "Consult SLAs depend on one person", urgency: "soon" },
      { category: "Customer Signals", signal: "Families start after a crisis, not by planning ahead", urgency: "watch" },
    ],
    missing_information: ["Hours per week available outside the day job", "Any family or hospital that has seen the product"],
  },
  Banlu: {
    readiness: {
      overall: 30,
      summary:
        "A clever operating model with one real relay completed, in a market far from the founder's core and with a hard two-sided network to build.",
      dimensions: [
        { name: "Problem", score: 55, note: "Long empty return legs are real; shipper pain unquantified." },
        { name: "Product", score: 50, note: "Working mobile prototype with a recorded custody handoff." },
        { name: "Customer", score: 30, note: "Many named segments, none validated." },
        { name: "Revenue", score: 5, note: "Pre-revenue; rates in validation." },
        { name: "Distribution", score: 20, note: "Needs both drivers and shippers on each corridor." },
        { name: "Technology", score: 48, note: "Dual GPS, Transfer Hub, messaging." },
        { name: "AI Advantage", score: 25, note: "Matching and routing; not a differentiator yet." },
        { name: "Moat", score: 25, note: "Corridor density could compound once it exists." },
        { name: "Operations", score: 20, note: "Driver vetting, insurance and medical handling are heavy." },
        { name: "Capital", score: 15, note: "Marketplace liquidity needs capital." },
        { name: "Team", score: 30, note: "No logistics operator documented." },
        { name: "Market", score: 50, note: "Medical equipment freight exists; size not measured." },
      ],
    },
    health: "FRAGILE",
    health_note: "Proven once in a demo; unproven as a business.",
    current_priority: "Decide whether Banlu stays a research track or gets a logistics co-founder.",
    biggest_opportunity: "Become the chain-of-custody record for medical equipment moves that HAOI and Cumpliva can verify.",
    biggest_risk: "Two-sided marketplace cold start plus regulatory and insurance load, with a solo founder.",
    current_bottleneck: "Driver liquidity on even one corridor.",
    top_3_actions: [
      "Write down what a second and third relay must prove before any more build work.",
      "Interview five DME (durable medical equipment) or home-health logistics buyers about cost per move today.",
      "Keep Banlu inside HAOI as the logistics adapter rather than a standalone company for now.",
    ],
    radar: [
      { category: "Risks", signal: "Cold-start marketplace on both sides of every corridor", urgency: "now" },
      { category: "Opportunities", signal: "Recorded custody handoff is useful to Cumpliva's verification", urgency: "soon" },
      { category: "Technology Shifts", signal: "Mobility layer already abstracts couriers, AVs, robots and drones", urgency: "watch" },
    ],
    missing_information: ["Cost per move today for a target shipper", "Driver supply on the Boston ↔ NY corridor"],
  },
  HAOI: {
    readiness: {
      overall: 33,
      summary:
        "The architecture is right: one identity, event, workflow and audit core under three products. It is ahead of the market, because no single product has a paying customer yet.",
      dimensions: [
        { name: "Problem", score: 55, note: "Care handoffs across vendors are unrecorded; buyers feel it per product, not as a platform." },
        { name: "Product", score: 60, note: "Working multi-product demo with real platform primitives." },
        { name: "Customer", score: 30, note: "Platform buyers (health systems) are slow and need proof per product." },
        { name: "Revenue", score: 5, note: "Pre-revenue." },
        { name: "Distribution", score: 25, note: "Will ride on whichever product lands first." },
        { name: "Technology", score: 68, note: "Tenancy, PHI scopes, events, workflows, approvals, audit, metering." },
        { name: "AI Advantage", score: 48, note: "Human-approved AI with full provenance fits healthcare buyers." },
        { name: "Moat", score: 40, note: "Cross-product evidence and audit trail compounds with use." },
        { name: "Operations", score: 25, note: "Solo founder across four codebases." },
        { name: "Capital", score: 20, note: "Unknown; assumed bootstrapped." },
        { name: "Team", score: 40, note: "Rare operator depth; no engineering or sales partner documented." },
        { name: "Market", score: 55, note: "Home- and community-based care is growing and fragmented." },
      ],
    },
    health: "FRAGILE",
    health_note: "Strong architecture, no customer pull yet. The risk is building breadth before depth.",
    current_priority: "Send your conflict-of-interest disclosure, then freeze platform breadth and take one product to a cleared pilot.",
    biggest_opportunity: "Own the coordination record between Massachusetts ASAPs and home care agencies, then extend it.",
    biggest_risk: "Selling into your employer's vendor network before written clearance, with four products, one founder and no customers.",
    current_bottleneck: "Focus: every hour is split across four surfaces.",
    top_3_actions: [
      "Send the written conflict-of-interest disclosure to your supervisor and HR this week.",
      "While you wait: do low-conflict work only (Elleah investor advisory, Banlu validation, HAOI build).",
      "Keep HAOI internal: no platform sales until two products have paying users.",
    ],
    radar: [
      { category: "Bottlenecks", signal: "Founder attention split across four products", urgency: "now" },
      { category: "Risks", signal: "Employer conflict-of-interest policy requires disclosure before any sales", urgency: "now" },
      { category: "Market Changes", signal: "MA home care licensing law raises compliance stakes", urgency: "now" },
      { category: "Moats", signal: "Shared evidence and audit trail across products", urgency: "soon" },
      { category: "Opportunities", signal: "ASAP ↔ agency network effect in Massachusetts", urgency: "soon" },
      { category: "Technology Shifts", signal: "Autonomous delivery adapters already designed into the mobility layer", urgency: "watch" },
    ],
    missing_information: ["Hours per week available", "Funding plan", "Which customer has seen which product"],
  },
};

const portfolio: Portfolio = {
  relationships: [
    {
      companies: ["Cumpliva", "Elleah Health"],
      relationship:
        "Same Massachusetts elder-services system from two sides: Elleah serves case managers and families, Cumpliva serves the home care agencies that ASAPs contract with. Same elders, services, authorizations and follow-ups.",
      strength: "strong",
    },
    {
      companies: ["HAOI", "Cumpliva"],
      relationship: "Cumpliva's verification is HAOI's 'checks it' layer; its evidence and audit model is the platform's trust core.",
      strength: "strong",
    },
    {
      companies: ["HAOI", "Elleah Health"],
      relationship: "Elleah's case record and follow-up engine map directly onto HAOI's workflow engine and tasks.",
      strength: "strong",
    },
    {
      companies: ["Banlu", "HAOI"],
      relationship: "Banlu is the mobility adapter: care needs become logistics jobs with recorded custody.",
      strength: "moderate",
    },
    {
      companies: ["Banlu", "Elleah Health"],
      relationship: "Equipment and transport needs come out of case management, but the buyers and operations differ.",
      strength: "weak",
    },
  ],
  shared_capabilities: [
    { capability: "Identity, orgs & role permissions (PHI-scoped)", used_by: ["HAOI", "Elleah Health", "Cumpliva", "Banlu"], build_once_note: "Already designed in HAOI. Every product should use it, not its own." },
    { capability: "Case & task workflow engine", used_by: ["Elleah Health", "Cumpliva"], build_once_note: "Elleah follow-ups and Cumpliva resolution steps are the same mechanism." },
    { capability: "Evidence store & verification", used_by: ["Cumpliva", "Banlu", "Elleah Health"], build_once_note: "EVV, visit notes, custody photos and documents as one evidence model." },
    { capability: "Audit trail with AI provenance", used_by: ["HAOI", "Elleah Health", "Cumpliva", "Banlu"], build_once_note: "Healthcare buyers' first question, answered once." },
    { capability: "Elder, worker & authorization records", used_by: ["Elleah Health", "Cumpliva"], build_once_note: "One elder record shared between the case-management side and the agency side." },
    { capability: "Messaging & ASAP portal", used_by: ["Cumpliva", "Elleah Health", "Banlu"], build_once_note: "Every call, SMS, email and portal message tied to its case." },
  ],
  structure_recommendation: "ONE PLATFORM, MULTIPLE PRODUCTS",
  recommendation_rationale:
    "These are one company, not four. HAOI is the right core, but it should stay invisible infrastructure until a product on top of it has paying customers. Cumpliva and Elleah are two sides of the same Massachusetts elder-services system; Banlu is an adapter, not a company, for now.",
  core_platform: {
    name: "HAOI",
    layers: [
      "Identity, organizations & PHI-scoped permissions",
      "Elder, worker, visit & authorization records",
      "Event bus & workflow engine (cases, tasks, deadlines, evidence)",
      "Evidence, verification & audit trail",
      "Human-approved AI & usage metering",
    ],
    products_on_top: ["Cumpliva (agencies) · build now, sell once cleared", "Elleah Health (case managers & families)", "Banlu (logistics adapter) · paused"],
  },
  focus_call:
    "First, your disclosure: nothing is sold until your employer clears it in writing. Cumpliva remains the strongest business (clear buyer, money on the line, a regulatory reason to act), but it carries the most conflict risk, so build it now and sell it only once cleared, outside your employer's network. Elleah investor advisory is the lowest-conflict path to first income meanwhile.",
  next_3_moves: [
    "Send the written conflict-of-interest disclosure to your supervisor and HR this week.",
    "Move Cumpliva onto HAOI's identity, case and evidence core and set its pilot price, without contacting agencies.",
    "Pitch one investor-side Elleah advisory offer to contacts outside your employer's network.",
  ],
};

export function founderPortfolio(): { companies: Company[]; portfolio: Workspace["portfolio"] } {
  const companies = [haoi(), cumpliva(), elleah(), banlu()];
  for (const c of companies) {
    const b = briefs[c.name];
    if (!b) continue;
    c.brief = { ...b, date: now() };
    c.readinessHistory = [{ date: today(), score: b.readiness.overall }];
    c.actions = b.top_3_actions.map((text, i) => ({
      id: uid(),
      text,
      horizon: i === 0 ? ("today" as const) : ("week" as const),
      done: false,
      source: "Initial brief",
      date: today(),
    }));
  }
  return { companies, portfolio: { ...portfolio, date: now() } };
}

export const SAMPLE_COMPANY_NAMES = ["Tandem Care", "Clearclaim", "Shiftwise"];

/**
 * Add the portfolio to a workspace. Companies that already exist by name keep
 * everything the founder entered; only their brief is refreshed and any new
 * recommended actions are added. `dropSample` removes the fictional sample first.
 */
export function mergeFounderPortfolio(base: Workspace, dropSample = false): Workspace {
  const w = dropSample ? { ...base, companies: base.companies.filter((c) => !SAMPLE_COMPANY_NAMES.includes(c.name)) } : base;
  const { companies, portfolio: p } = founderPortfolio();
  const byName = new Map(companies.map((c) => [c.name.toLowerCase(), c]));
  const updated = w.companies.map((c) => {
    const next = byName.get(c.name.toLowerCase());
    if (!next?.brief) return c;
    const known = new Set(c.actions.map((a) => a.text.toLowerCase()));
    return {
      ...c,
      brief: next.brief,
      readinessHistory: [...c.readinessHistory, ...next.readinessHistory].slice(-24),
      actions: [...next.actions.filter((a) => !known.has(a.text.toLowerCase())), ...c.actions],
    };
  });
  const existing = new Set(w.companies.map((c) => c.name.toLowerCase()));
  const fresh = companies.filter((c) => !existing.has(c.name.toLowerCase()));
  const all = [...updated, ...fresh];
  const lead = all.find((c) => c.name === "HAOI");
  return { ...w, companies: all, activeCompanyId: lead?.id ?? w.activeCompanyId, portfolio: p };
}
