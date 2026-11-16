// Stage B (validation) pipeline. Pure and deterministic: given the documents,
// the extraction output and the configuration, it produces the full analysis.

import { scanForInjection, validateExtraction, type RawExtraction } from '@shared/extraction-contract.ts';
import type { FunctionalAreaDef } from '@shared/fact-catalog.ts';
import { compareAdlIadl, parseCdsRecords } from './adl-iadl-comparator.ts';
import { mapToCds } from './cds-mapper.ts';
import { buildCorrectionReport, determineFinalStatus } from './correction-report.ts';
import { detectDiscrepancies } from './discrepancy-detector.ts';
import { enrichFacts, FactIndex } from './facts.ts';
import { generateFollowUpTasks } from './follow-up-generator.ts';
import { runQaChecklist } from './qa-checklist-engine.ts';
import type { AnalysisResult, CdsTemplate, ProviderInfo, QaChecklist, ReviewInput } from './types.ts';

export const ENGINE_VERSION = '0.1.0';

export interface EngineConfig {
  cdsTemplate: CdsTemplate;
  qaChecklist: QaChecklist;
  functionalAreas: FunctionalAreaDef[];
}

export function runValidation(input: ReviewInput, extraction: RawExtraction, provider: ProviderInfo, config: EngineConfig): AnalysisResult {
  const docs = input.documents.filter((d) => d.text.trim());
  // Re-validate on the client too (defense in depth): unknown keys and unverifiable evidence are rejected.
  const validated = validateExtraction(extraction, docs, config.functionalAreas);
  const allFacts = enrichFacts(validated.facts, docs, config.functionalAreas);
  const allIndex = new FactIndex(allFacts);
  // The CDS record is compared against, never used as narrative evidence.
  const narrativeIndex = new FactIndex(allFacts.filter((f) => f.location.docType !== 'CDS Record'));
  const cdsRecord = parseCdsRecords(docs);

  const injectionWarnings = [...new Set([...scanForInjection(docs), ...validated.injectionWarnings])];
  const cds = mapToCds(config.cdsTemplate, narrativeIndex, cdsRecord, config.functionalAreas);
  const adl = compareAdlIadl(config.functionalAreas, narrativeIndex, cdsRecord, docs);
  const discrepancies = detectDiscrepancies(allIndex);
  const qa = runQaChecklist(config.qaChecklist, { facts: narrativeIndex, allFacts: allIndex, docs, cdsRecord, adl, discrepancies, input });
  const issues = buildCorrectionReport({ qa, checklist: config.qaChecklist, adl, cds, discrepancies, facts: narrativeIndex, docs, injectionWarnings });
  const tasks = generateFollowUpTasks(narrativeIndex);
  const final = determineFinalStatus({ qa, adl, discrepancies, cds });

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    provider,
    configVersions: { cdsTemplate: `${config.cdsTemplate.id}@${config.cdsTemplate.version}`, qaChecklist: `${config.qaChecklist.id}@${config.qaChecklist.version}` },
    facts: allFacts,
    rejectedFacts: validated.rejected,
    injectionWarnings,
    cdsRecord,
    cds,
    adl,
    qa,
    discrepancies,
    issues,
    tasks,
    finalStatus: final.status,
    finalStatusReasons: final.reasons,
  };
}
