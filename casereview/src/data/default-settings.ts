import { DEFAULT_FUNCTIONAL_AREAS } from '@shared/fact-catalog.ts';
import { buildDefaultCdsTemplate } from '../config/cds-template.ts';
import { DEFAULT_QA_CHECKLIST } from '../config/qa-checklist.ts';
import type { OrgSettings } from './types.ts';

export function defaultSettings(): OrgSettings {
  const envMode = import.meta.env?.VITE_AI_MODE === 'claude' ? 'claude' : 'mock';
  return {
    aiMode: envMode,
    aiEndpoint: (import.meta.env?.VITE_AI_ENDPOINT as string | undefined) ?? '',
    retentionDays: Number(import.meta.env?.VITE_DEFAULT_RETENTION_DAYS ?? 90),
    cdsTemplate: buildDefaultCdsTemplate(DEFAULT_FUNCTIONAL_AREAS),
    qaChecklist: structuredClone(DEFAULT_QA_CHECKLIST),
    functionalAreas: structuredClone(DEFAULT_FUNCTIONAL_AREAS),
    idleTimeoutMinutes: 15,
  };
}
