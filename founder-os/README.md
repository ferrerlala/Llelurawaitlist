# Founder OS

Your strategic intelligence layer: one executive brain behind your company.

Founder OS runs every question through a single **Founder Intelligence Engine**. The engine combines first-principles, product, technology, business, investor, customer, operational, strategic, healthcare, risk and innovation thinking into **one** voice. It then reduces that analysis to one decision and a short action plan:

```
INPUT → INTELLIGENCE ENGINE → MULTI-DIMENSIONAL ANALYSIS → SYNTHESIS → DECISION → ACTION PLAN
```

## Quick start

```bash
cd founder-os
npm install
cp .env.example .env.local     # set ANTHROPIC_API_KEY
npm run dev                    # http://localhost:3000
```

The app runs without a key too. Click **Load sample workspace** on the first screen to explore a fictional three-company portfolio, including a full brief, an analysis and a platform recommendation. Live analysis needs `ANTHROPIC_API_KEY`.

## What's inside

| Area | What it does |
|---|---|
| **CEO Brain** (`/brain`) | The main screen. Ask anything and the full engine runs on it. Answers come back as a hierarchy: **The answer → why → opportunity → risk → decision → next 3 moves**. "Show me the deeper analysis" opens the synthesis, every lens, the 10X engine, the moat engine, the 1–3 risks that could kill the idea, the execution plan and healthcare considerations. |
| Modes | **Think**, **Decide** (scored decision matrix with what I would / would not do), **Build** (problem → MVP → pricing → validation → next 3 actions), **Grow** (bottleneck, channel, segment, next experiment), **Opportunity** (0–100 score), **Challenge me** (direct pushback). |
| **Command Center** (`/`) | Company health, a 12-dimension readiness score (0–100) with history, current priority, bottleneck, biggest opportunity and risk, top 3 actions, key metrics, decisions, experiments and ideas. |
| **Strategic Radar** (`/radar`) | Opportunities, risks, moats, bottlenecks, customer signals, competitive moves, technology shifts and market changes. Distance from the center shows urgency. Click any signal to think it through. |
| **Execution** (`/execution`) | Today / this week / this month / next 90 days. Each column has a deliberately small limit. |
| **Company Memory** (`/memory`) | Profile, metrics, assumptions, decision log and experiments. Every engine call includes this memory, so you never have to repeat yourself. The engine also notices new facts you mention and offers to save them. |
| **Portfolio** (`/portfolio`) | Holds multiple companies. The platform detector finds shared capabilities and recommends whether to keep them separate, share infrastructure, or run one platform with several products. |

## Architecture

- **Next.js 16 (App Router) + TypeScript.** The UI uses no component library, just a small custom design system in `app/globals.css`.
- **Engine**: `lib/engine.ts` holds the unified doctrine (the system prompt) and the per-mode prompts. `lib/schemas.ts` defines the structured output contracts (Zod). The fields are ordered *analysis → synthesis → decision → action*, which mirrors the pipeline.
- **Model calls**: `lib/claude.ts` streams from the Claude API (`claude-opus-5-5`, adaptive thinking, `effort: high`, structured outputs). It enables server-side refusal fallbacks (`fallbacks: "default"`), and the doctrine is a cached system prefix. Each route streams NDJSON to the browser, so the pipeline view updates live as stages complete.
- **Routes**: `POST /api/analyze` (CEO Brain and all modes), `POST /api/brief` (Command Center + readiness), `POST /api/portfolio` (platform detector) and `GET /api/health`.
- **Memory**: stored in the browser (`localStorage`). Use Export/Import on the Memory page to back it up or move it. No server database is required.

## Configuration

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Required for live analysis. Read only on the server. |
| `FOUNDER_OS_MODEL` | Optional model override (default `claude-opus-5-5`). |
| `FOUNDER_OS_PASSCODE` | Optional. When set, the engine endpoints require this passcode. **Set it before deploying anywhere public**, because every call spends API credits. |

## Scripts

`npm run dev` · `npm run build` · `npm start` · `npm run typecheck`
