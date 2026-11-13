# CaseReview QA

**An AI-assisted tool for reviewing case management documentation, preparing the Comprehensive Data Set (CDS), and running quality assurance (QA)**, built for Massachusetts Aging Services / Home Care case management workflows.

A case manager pastes or uploads one annual assessment or journal note. The application then:

- extracts facts that are stated explicitly, each linked to its exact source sentence;
- prepares suggested CDS responses, each with a status and confidence level;
- compares every ADL/IADL between the narrative and a supplied CDS record;
- evaluates the 17 annual QA categories;
- detects conflicts within and across documents;
- builds a prioritized correction report and follow-up tasks;
- produces a printable Final Case Review Report and WellSky Transfer Guide.

The case manager approves, edits or rejects every suggestion. Every change is recorded in an audit trail. Verified information is entered into WellSky **manually**.

> **Important**
> - This product is **not affiliated with, endorsed by, or integrated with AgeSpan or WellSky.**
> - AI output is a preparation aid. The tool **never** labels a file "QA Passed", never certifies eligibility, and never presents AI responses as final assessments.
> - CDS questions and answer choices come from the CDS-3-CM v3.3.2 form export. Which narrative statements support which answers is this tool's suggestion and must be verified. Items outside CDS-3-CM ("Other WellSky records") use a provisional mapping.
> - Use **fictional data only** until all of the [requirements for real consumer data](#security-and-production-deployment-requirements) are met.

---

## Architecture

```
Browser (React + TypeScript + Tailwind)
 ├─ New Case Review ── paste text / upload PDF, DOCX, TXT (text extracted locally)
 ├─ Stage A: extraction provider (src/ai/providers.ts)
 │    ├─ Mock AI mode: deterministic rule-based extractor (no external service)
 │    └─ Claude: POST → server endpoint (key stays on the server)
 │          ├─ local dev: Vite middleware  server/dev-ai-endpoint.ts
 │          └─ production: Supabase Edge Function  supabase/functions/analyze-assessment
 ├─ Stage B: deterministic validation engine (src/engine) — runs on every result
 │    evidence check → CDS mapper → ADL/IADL comparator → discrepancy detector
 │    → QA checklist engine → correction report → follow-up generator
 └─ Repository (src/data)
      ├─ Supabase (PostgreSQL + Auth + RLS + private Storage) when configured
      └─ Local demo storage (this browser only) otherwise
```

| Module (spec name) | Location |
|---|---|
| assessment-parser | `src/engine/assessment-parser.ts`, `src/lib/document-text.ts` |
| clinical-data-extractor | `src/engine/clinical-data-extractor.ts` (mock), `supabase/functions/_shared/claude-extract.ts` (Claude) |
| cds-mapper | `src/engine/cds-mapper.ts`, config `src/config/cds-template.ts` |
| adl-iadl-comparator | `src/engine/adl-iadl-comparator.ts` |
| qa-checklist-engine | `src/engine/qa-checklist-engine.ts`, config `src/config/qa-checklist.ts` |
| discrepancy-detector | `src/engine/discrepancy-detector.ts`, `src/engine/correction-report.ts` |
| follow-up-generator | `src/engine/follow-up-generator.ts` |
| report-generator | `src/report/report-generator.ts` |
| audit-log-service | `src/data/review-actions.ts` (+ `audit_logs` table) |
| Extraction contract, fact catalog, prompt-injection scan | `supabase/functions/_shared/` (shared by the browser, the dev server and the Edge Function) |

### Two-stage AI workflow

1. **Stage A: extraction.** The provider returns structured JSON only (Claude uses structured outputs with a JSON schema). Each fact carries a key from the fact catalog, a value, an assertion (`affirmed`, `reported_absent`, `declined`, `not_completed`, `planned`, `uncertain`), a confidence level, and the **verbatim source text**.
2. **Server-side validation.** The server rejects unknown keys and any fact whose source text does not appear word-for-word in the cited document. The browser repeats the same check.
3. **Stage B: validation.** Deterministic engines compare the facts with the configured CDS mapping, ADL/IADL rules, QA checklist and supporting documents. Conflicts are shown side by side and are never resolved automatically.

**Prompt-injection safeguards:**
- Documents are wrapped in `<document>` tags.
- The system prompt declares them untrusted data.
- A deterministic scan flags instruction-like text.
- Any finding the AI produces must still pass the evidence check and the deterministic rules.

---

## Installation

Requirements: Node.js 20+ (tested on 22) and npm.

```bash
cd casereview
npm install          # .npmrc enables legacy-peer-deps for the Vite 8 toolchain
cp .env.example .env.local
npm run dev          # http://localhost:5173
```

With no Supabase settings, the app runs in **demo mode**:
- sign in with any display name and role;
- data is stored only in this browser (`localStorage`, separated by organization);
- AI runs in **Mock AI mode**.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server, including the local Claude endpoint `/api/analyze` |
| `npm run build` | Type-check and production build to `dist/` |
| `npm test` | Acceptance tests 1–10, plus safeguard and Claude-provider tests (Vitest) |
| `npm run test:db` | Migration and row-level-security tests against a **throwaway** PostgreSQL database (`DATABASE_URL=...`) |
| `npm run typecheck` | TypeScript checks for the app, the dev server and the Edge Function |

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | browser | Enable Supabase auth and storage. Omit both for demo mode. |
| `VITE_AI_MODE` | browser | Default provider for new organizations: `mock` (default) or `claude`. |
| `VITE_AI_ENDPOINT` | browser | Optional override for the Claude endpoint URL. |
| `VITE_DEFAULT_RETENTION_DAYS` | browser | Default retention period (90). |
| `ANTHROPIC_API_KEY` | **server only** (`.env.local` for dev, Supabase secret for prod) | Claude credentials. Never use a `VITE_` prefix. |
| `CLAUDE_MODEL` | server | Optional. Defaults to `claude-opus-5-5`. |
| `AI_PROVIDER_PHI_APPROVED` | dev server | Keep `false`. Every Claude request then requires a fictional-data attestation. |
| `ALLOWED_ORIGIN` | Edge Function | CORS origin for the deployed frontend. |

## Database setup (Supabase)

1. Create a Supabase project. For real PHI, use a HIPAA-eligible plan with a signed BAA; see the security section.
2. Apply the schema:
   ```bash
   supabase link --project-ref <ref>
   supabase db push              # applies supabase/migrations/20261113000000_initial_schema.sql
   ```
3. Create an organization and its settings in the SQL editor (`supabase/seed.sql` contains a fictional example).
4. Create users in **Authentication › Users**, then link each user to an organization and role:
   ```sql
   insert into public.profiles (id, organization_id, full_name, role)
   values ('<auth user id>', '<organization id>', 'Full Name', 'case_manager');  -- case_manager | qa_reviewer | supervisor | admin
   ```
5. Optional: schedule retention purging with pg_cron:
   `select cron.schedule('purge-expired-reviews', '15 3 * * *', 'select public.purge_expired_reviews()');`
6. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then restart the app. The login screen switches to email/password sign-in.

### What the schema contains

Tables:
- organizations, profiles (users)
- org_settings
- cds_templates, cds_field_mappings
- adl_iadl_categories
- qa_checklist_versions
- cases, assessments, documents
- case_reviews, extracted_facts, qa_results, discrepancies, follow_up_tasks
- case_manager_approvals
- audit_logs

Row-level security and storage:
- RLS is enabled on every table, and tenant isolation uses `public.current_org_id()`, which is derived from the caller's profile.
- Only supervisors and admins can change configuration or delete records.
- Users cannot change their own organization or role.
- `audit_logs` and `case_manager_approvals` are insert-only.
- Anonymous users have no table access.
- Original uploads go to the private `case-documents` bucket, with storage policies scoped to the organization's folder.

`supabase/tests/rls_test.sql` verifies these rules (16 checks). The current version passes on PostgreSQL 16.

## AI provider configuration

- **Mock AI mode (default):** no external calls. Results are clearly labeled "MOCK AI MODE" throughout the UI and the reports.
- **Claude, local development:** put `ANTHROPIC_API_KEY=...` in `.env.local`, then run `npm run dev` and choose **Settings › AI provider › Claude**. Use **Check AI endpoint** to confirm the setup.
- **Claude, production:**
  ```bash
  supabase secrets set ANTHROPIC_API_KEY=... ALLOWED_ORIGIN=https://your-app.example
  supabase functions deploy analyze-assessment
  ```
  The function:
  - verifies the user's JWT and organization membership;
  - refuses requests unless `org_settings.ai_provider_phi_approved = true` or the user attests the data is fictional or de-identified;
  - never logs document content.
- Request details: model `claude-opus-5-5`, adaptive thinking at `effort: high`, streaming, and structured JSON output. Server-side refusal fallback (`fallbacks: "default"`) is enabled; a refused request is re-run on a fallback model chosen by refusal category. Remove it in `claude-extract.ts` if you don't want it.
- The provider layer (`ExtractionProvider`) is independent of any vendor. Another approved provider only has to return the same `RawExtraction` contract.

## How to test the sample assessment

1. Run `npm run dev` and enter the demo workspace.
2. Go to **New Case Review › Load fictional sample › Analyze documentation**.
3. Review the result tabs: Assessment Summary, CDS Preparation, ADL/IADL Comparison, QA Checklist, Corrections, Follow-Up, Final Report and Audit History.
4. For cross-document checks, add **+ Sample CDS record** (ADL matches, omissions and conflicts) or **+ Sample financial worksheet** (copay conflict: $0 vs $15.00) before analyzing.

Expected results for the sample narrative (all covered by `npm test`):

| # | Expected | Result |
|---|---|---|
| 1 | Mini-Cog declined, not completed | `declined` assertion; CDS shows "Mini-Cog not completed – consumer declined" |
| 2 | Independent ADLs/IADLs identified | money management, medication management, indoor locomotion, bed mobility, eating, telephone, toileting, incontinence management |
| 3 | Undocumented areas need verification | bathing, dressing, housekeeping, laundry, transfers and outdoor mobility are "Not Documented"; meal preparation, shopping and transportation are "Needs Verification" |
| 4 | Fall-risk screening still needs verification | QA 10: Needs Review (K5 not verified) |
| 5 | PCP list mailing is a pending task | One merged task, Case Manager, **no due date** |
| 6 | Income, copay and balance extracted | $12,827.18 / $0 / $0 |
| 7 | Risk 3 / FIL 1C need comparison | QA 9 and QA 11: Unable to Verify |
| 8 | Incomplete IDC participant name | QA 16: Missing ("Linda L.") |
| 9 | MLS not present | QA 7: Missing |
| 10 | Financial worksheet needs verification | QA 4: Missing |
| 11 | Emergency services permission needs the form and A&D Notes | QA 17: Needs Review |
| 12 | CDS cannot be declared complete | QA 8: Unable to Verify ("CDS responses were not supplied") |

### Agency-template sample

**Load agency-template sample** loads a fictional annual assessment written in the labeled-field template many agencies use. Its features:
- `Location of Assessment: …` style fields;
- `a.` / `4)` / `—` list markers;
- title-case section headings.

The parser treats field labels as labels, not values. A label with nothing after it is reported as a blank template field. Expected findings (`tests/agency-template.test.ts`):
- **Transfers** and **Indoor locomotion** are documented as both independent ("independence with transferring, ambulation within the home") and assisted ("Assistance is provided with … transfers, indoor/outdoor mobility"). This is a High-priority correction, and final status is **Corrections Required**.
- "Assistance is provided with …" is read as Needs Assistance. The level isn't stated, so the CDS responses stay **Needs Verification**.
- "Self-reported assessment of health:" is left blank, which is flagged.
- Recent surgery is reported, yet the note also says "no changes in needs" and "no recent hospitalizations". This is flagged for reconciliation.
- "IDC … None indicated", "did not identify any goals" and "No additional follow-up actions" are documented absences. They are not tasks and not Complete; QA 16 is Needs Review.
- Income, copay, MassHealth (Pending), Risk 3 / FIL 1C, program (HCB-NW), PCA hours and next assessment are extracted from labeled fields.

Final status for the sample alone: **Additional Documentation Required**. With the conflicting CDS excerpt or financial worksheet added, it becomes **Corrections Required**.

## Annual assessment workflow (primary workflow)

```
Previous assessment + new changes → annual journal draft → case manager approval
  → automatic CDS-3-CM preparation → journal↔CDS consistency validation
  → Fix Documentation Issues (correction loop) → independent QA audit → score /100 → final approval → report
```

| Stage | Where | Module |
|---|---|---|
| Start Annual Assessment | `/annual` | `src/pages/StartAnnualAssessmentPage.tsx`, `src/workflow/journal-builder.ts`, journal format `src/config/journal-template.ts` |
| Journal approval → CDS | "Approve journal & prepare CDS" | `approveJournal` in `src/workflow/engine.ts` |
| Consistency validation | Fix Documentation Issues tab | `src/workflow/consistency.ts` |
| Correction loop | Fix Documentation Issues tab, `/fix` | `applyFindingAction`, `reviseJournal` in `src/workflow/engine.ts` |
| Independent QA and score | QA Score tab | `src/workflow/independent-qa.ts` |
| Final report | Final Report tab | `generateWorkflowReportHtml` in `src/report/report-generator.ts` |

### 1. Prefilled journal

- **Retrieving the previous assessment.** It comes from reviews stored in this application for the same case ID. Notes in the agency template are read field by field; older formats are recovered sentence by sentence.
- **Per-field review.** For each of the 38 fields in the 24 sections, the case manager marks it Unchanged (confirmed), Changed (enters the update) or Clarify.
- **Unreviewed fields are never carried forward.** They become `[[CLARIFY: …]]` markers, and the journal cannot be approved while any marker remains.
- **Visit-specific fields must be re-entered or confirmed.** These include people present, observations, memory screen, consents, application, packet, goals, IDC and planned actions. The assessment date is filled from the form; the next assessment date can't be carried forward.
- **Changes are detected per fact.** Extracted facts are compared, e.g. "personal care: 30 hours per week PCA (one worker) → 40 hours per week PCA (two workers)", "conditions added: essential tremor", "living arrangement no longer documented: lives alone". Carried-forward items are flagged for checking.
- **Drafting is rule-based assembly, not generative AI.** Every line is the case manager's text, a previous line they confirmed, or a clarification marker. No medical, service, financial or eligibility content is generated. The whole journal can be edited before approval.

### 2–4. CDS, validation and corrections

- **CDS preparation on approval.** The approved journal is the source document for the CDS-3-CM worksheet. Each answer shows its journal section and evidence; the level is never guessed.
- **What the validator finds**, each with journal information, CDS answer, exact mismatch, why it matters, suggested correction, and whether clarification is needed:
  - ADL contradictions;
  - mobility device vs. independence;
  - missing ADLs/IADLs and unstated levels;
  - CDS answers that contradict or lack journal support;
  - formal vs. informal support (e.g. a family member who is also a paid PCA);
  - service hours;
  - copay, financial and risk conflicts;
  - hospitalization/fall/health-event conflicts;
  - FIL vs. ADL counts;
  - blank fields;
  - QA items needing documentation or a WellSky record.
- **Fix Documentation Issues actions:** accept a suggested correction (e.g. "Transfers: needs assistance — remove it from the independence statement"), edit, provide missing information, edit a CDS answer, mark a record verified (labeled attestation), mark unable to verify, reject a finding, re-run validation, and bulk-confirm "Ready for Review" answers.
- **Every journal change is a new approved version.** The CDS is re-prepared and all checks re-run. Decisions whose suggestion changed are invalidated for re-confirmation, the affected CDS answers and QA results are listed, and the original text, every version, every action and the audit log are kept. Final approval is invalidated by any later change.

### 5–7. Independent QA and score

- **Independence.** The reviewer re-reads the final journal and documents with its own extraction pass. It does not reuse the earlier stages' facts, suggestions or QA results, and it re-checks the case manager's final CDS answers against the journal.
- **Weights.** The 17 categories use the configured weights (Settings › QA checklist `points`).
  - Status factors: Complete 1, Needs Review 0.5, Unable to Verify 0.25, Missing 0, Mismatch 0. Not Applicable is excluded from the denominator.
  - Score = earned ÷ applicable points × 100.
  - **The weighting table as specified totals 101 points.** It is kept as given; the normalized score still ranges 0–100, and Settings shows a warning until the weights are adjusted.
- **Bands:**
  - 95–100 Excellent documentation
  - 90–94 Strong documentation, minor issues may remain
  - 80–89 Corrections required
  - 70–79 Significant documentation gaps
  - Below 70 Not ready for QA review
- **"Ready for Human QA Review" requires all of:** no unresolved critical finding, no missing required evidence, no unresolved journal/CDS contradiction, and a valid case-manager final approval. A high score never overrides these.
- **The score is an internal pre-QA estimate**, not an official AgeSpan QA score or a guarantee of approval.

**Acceptance test:** `tests/annual-workflow.test.ts`. It runs the complete workflow on the fictional November 12, 2026 sample (`SAMPLE_PREVIOUS_JOURNAL` + `SAMPLE_ANNUAL_CHANGES`). In the UI: **Start Annual Assessment › Load fictional example**.

## CDS instrument (CDS-3-CM v3.3.2)

The default CDS template is built from the **CDS-3-CM – Case Manager Comprehensive Data Set v3.3.2** form export: 527 questions with their official item codes and answer choices.
- **Instrument file:** `src/config/cds-3-cm/cds-3-cm-v3.3.2.json`
- **Narrative-to-answer mapping:** `src/config/cds-3-cm/mapping.ts`
- **Template builder:** `src/config/cds-3-cm/index.ts`

How suggestions work:
- **About 125 questions are prepared from the narrative.** These include demographics, goals, the memory loss screen, every H.1 IADL / H.2 ADL performance code and "who helps", FIL items, J diagnoses, K.5 falls, the emergency device, therapies and hospital admissions. The others are shown as "complete from the assessment".
- **Candidates, not a single guessed code.** When the narrative doesn't state the level, the case manager picks the verified code from a dropdown of the official choices. Example: "Assistance is provided with bathing" lists codes `1–5`.
- **Unmentioned items are never answered "No".** Diagnoses, falls and the like that the narrative doesn't mention are "Not Documented", never `0 - No` / `0 - Not present`.
- **QA 9 checks the documented FIL against the form's own definitions.** It compares the FIL to the ADL/IADL deficits the narrative can support. Example: "1-C/1-NC requires 4 or more ADLs". It never calculates or certifies the FIL.
- **Items not on CDS-3-CM have their own section.** Financial, MLS, risk worksheet, consent and IDC items are listed under "Other WellSky records".

**Updating to a new form version:**
```bash
node scripts/parse-cds-form.mjs <form-export.pdf> src/config/cds-3-cm/cds-<version>.json   # needs pdftotext (poppler-utils)
```
- **Privacy:** form printouts carry the consumer's name and ID in every page header. The script removes page headers and footers, and refuses to write the file if any header text remains. Use a blank form when possible.
- **After parsing:** check that `npm test` still resolves every mapping (`tests/cds-instrument.test.ts`).

## Features still needing configuration

- **CDS mapping review.** CDS-3-CM v3.3.2 is configured. Program staff should review the narrative-to-answer rules in `src/config/cds-3-cm/mapping.ts`. The "Other WellSky records" section still uses a provisional mapping.
- **QA checklist wording.** Review the requirement text against the official AgeSpan 2026/2027 checklist and your local policies. Change the `version` on every edit.
- **FIL calculation.** Intentionally not implemented. QA 9 only checks the documented FIL against the CDS-3-CM definitions; critical unmet need (C vs. NC) always requires verification.
- **Visit schedule rules.** QA 2 and QA 12 timing currently needs human verification. Configure program schedules and the business-day calendar if automation is wanted.
- **Organization onboarding UI.** Profiles are created with SQL today.
- **Uploading original files to the `case-documents` bucket.** The bucket and its policies exist, but the MVP stores only the extracted text in `documents`.
- **Scanned PDFs (OCR).** Not supported.
- **Report export.** Word export is Word-compatible HTML (`.doc`). PDF export uses the browser's Print / Save as PDF.
- **Phase 2 and 3 items** (historical comparisons across assessments, supervisor analytics, direct WellSky integration). Not built. Direct WellSky integration requires approved API access, organizational authorization and technical validation.

## Security and production deployment requirements

Implemented:
- Authentication (Supabase Auth), roles, and organization isolation through RLS.
- Insert-only audit and approval trails.
- Private storage bucket.
- Session stored per browser tab, with a configurable idle sign-out.
- Configurable retention and purge.
- The API key is held on the server only.
- No document text in application logs, no analytics, and no third-party error tracking.
- Encryption in transit through HTTPS (Supabase and the hosting provider).
- Prompt-injection scanning.
- Verbatim-evidence validation of AI output.

**A technically secure application is not automatically HIPAA compliant.** Before any real consumer data enters the system, all of the following are required:
1. Organizational approval and a documented security and risk assessment.
2. An approved hosting environment, with HIPAA-eligible Supabase or equivalent, under a signed **Business Associate Agreement**.
3. A BAA with the **AI provider** before setting `ai_provider_phi_approved = true`. Until then, use Mock AI mode or fictional/de-identified data only.
4. MFA enforcement, password policy and SSO as required by the organization (configure these in Supabase Auth).
5. Backups, disaster recovery, a log retention policy, and audit-log review procedures.
6. Validation of the official CDS mapping and QA checklist by the program before relying on suggestions.
7. Penetration testing, a dependency vulnerability review, and a restrictive Content Security Policy at the hosting layer.

Never use actual AgeSpan consumer records for testing without authorization.
