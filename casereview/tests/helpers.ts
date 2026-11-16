import { DEFAULT_FUNCTIONAL_AREAS } from '@shared/fact-catalog.ts';
import type { SourceDocument, DocumentType } from '@shared/extraction-contract.ts';
import { buildCds3CmTemplate } from '../src/config/cds-3-cm/index.ts';
import { DEFAULT_QA_CHECKLIST } from '../src/config/qa-checklist.ts';
import { runValidation, type EngineConfig } from '../src/engine/analyze.ts';
import { extractWithRules } from '../src/engine/clinical-data-extractor.ts';
import type { ReviewInput } from '../src/engine/types.ts';

export const config: EngineConfig = {
  cdsTemplate: buildCds3CmTemplate(),
  qaChecklist: DEFAULT_QA_CHECKLIST,
  functionalAreas: DEFAULT_FUNCTIONAL_AREAS,
};

export function doc(id: string, text: string, type: DocumentType = 'Narrative / Journal Note', name = `${type} ${id}`): SourceDocument {
  return { id, name, type, text };
}

export function analyze(docs: SourceDocument[], overrides: Partial<ReviewInput> = {}) {
  const input: ReviewInput = {
    caseIdentifier: 'TEST-0001', assessmentType: 'Annual Redetermination', assessmentDate: '2025-10-01', program: 'Home Care', documents: docs, ...overrides,
  };
  return runValidation(input, extractWithRules(docs), { mode: 'mock', label: 'Rule-based mock' }, config);
}
