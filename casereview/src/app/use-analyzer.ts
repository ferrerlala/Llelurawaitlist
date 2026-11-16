import { useApp } from './AppContext.tsx';
import { runAnalysis } from './run-analysis.ts';
import type { Analyzer } from '../workflow/engine.ts';
import type { ReviewRecord } from '../data/types.ts';

/** Analyzer bound to the organization settings (mock or Claude provider). */
export function useAnalyzer(review?: ReviewRecord | null, attested = false): Analyzer {
  const { settings } = useApp();
  return (input) => runAnalysis(input, settings, { fictionalDataAttestation: attested || !!review?.workflow?.aiAttested });
}
