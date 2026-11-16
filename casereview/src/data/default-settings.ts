import { DEFAULT_FUNCTIONAL_AREAS } from '@shared/fact-catalog.ts';
import { buildCds3CmTemplate } from '../config/cds-3-cm/index.ts';
import { DEFAULT_QA_CHECKLIST } from '../config/qa-checklist.ts';
import type { OrgSettings } from './types.ts';
import { DEFAULT_JOURNAL_TEMPLATE, SIX_MONTH_JOURNAL_TEMPLATE } from '../config/journal-template.ts';

export function defaultSettings(): OrgSettings {
  const envMode = import.meta.env?.VITE_AI_MODE === 'claude' ? 'claude' : 'mock';
  return {
    aiMode: envMode,
    aiEndpoint: (import.meta.env?.VITE_AI_ENDPOINT as string | undefined) ?? '',
    retentionDays: Number(import.meta.env?.VITE_DEFAULT_RETENTION_DAYS ?? 90),
    cdsTemplate: buildCds3CmTemplate(DEFAULT_FUNCTIONAL_AREAS),
    qaChecklist: structuredClone(DEFAULT_QA_CHECKLIST),
    functionalAreas: structuredClone(DEFAULT_FUNCTIONAL_AREAS),
    idleTimeoutMinutes: 15,
    journalTemplate: structuredClone(DEFAULT_JOURNAL_TEMPLATE),
    sixMonthJournalTemplate: structuredClone(SIX_MONTH_JOURNAL_TEMPLATE),
  };
}
