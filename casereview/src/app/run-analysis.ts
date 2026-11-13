import { claudeProvider, mockProvider, resolveClaudeEndpoint } from '../ai/providers.ts';
import type { OrgSettings } from '../data/types.ts';
import { runValidation } from '../engine/analyze.ts';
import type { AnalysisResult, ReviewInput } from '../engine/types.ts';

/** Two-stage workflow: Stage A extraction (provider) → Stage B deterministic validation. */
export async function runAnalysis(input: ReviewInput, settings: OrgSettings, opts: { fictionalDataAttestation: boolean }): Promise<AnalysisResult> {
  const docs = input.documents.filter((d) => d.text.trim());
  if (!docs.length) throw new Error('Add at least one document with text.');
  const provider = settings.aiMode === 'claude' ? claudeProvider(resolveClaudeEndpoint(settings)) : mockProvider;
  const extraction = await provider.extract(docs, settings.functionalAreas, opts);
  return runValidation({ ...input, documents: docs }, extraction, provider.info, {
    cdsTemplate: settings.cdsTemplate,
    qaChecklist: settings.qaChecklist,
    functionalAreas: settings.functionalAreas,
  });
}
