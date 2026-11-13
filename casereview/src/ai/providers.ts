// Provider-independent AI service layer (Stage A: extraction).
// Providers only extract; all validation and QA logic runs in the deterministic engine.

import type { RawExtraction, SourceDocument } from '@shared/extraction-contract.ts';
import type { FunctionalAreaDef } from '@shared/fact-catalog.ts';
import { extractWithRules } from '../engine/clinical-data-extractor.ts';
import type { ProviderInfo } from '../engine/types.ts';
import { supabase, supabaseUrl } from '../lib/supabase.ts';
import type { OrgSettings } from '../data/types.ts';

export interface ExtractionProvider {
  info: ProviderInfo;
  extract(docs: SourceDocument[], areas: FunctionalAreaDef[], opts: { fictionalDataAttestation: boolean }): Promise<RawExtraction>;
}

export const mockProvider: ExtractionProvider = {
  info: { mode: 'mock', label: 'MOCK AI MODE – deterministic rule-based extraction (no external AI service)' },
  async extract(docs, areas) {
    return extractWithRules(docs, areas);
  },
};

export function resolveClaudeEndpoint(settings: OrgSettings): string {
  if (settings.aiEndpoint) return settings.aiEndpoint;
  if (supabaseUrl) return `${supabaseUrl}/functions/v1/analyze-assessment`;
  return '/api/analyze';
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (anon) headers.apikey = anon;
  }
  return headers;
}

export function claudeProvider(endpoint: string): ExtractionProvider {
  return {
    info: { mode: 'claude', label: 'Claude (Anthropic) via secured server endpoint' },
    async extract(docs, areas, opts) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ documents: docs, areas, fictionalDataAttestation: opts.fictionalDataAttestation }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; extraction?: RawExtraction; model?: string };
      if (!res.ok || !body.extraction) throw new Error(body.error ?? `AI endpoint returned ${res.status}`);
      this.info = { ...this.info, model: body.model };
      return body.extraction;
    },
  };
}

export interface AiStatus { configured: boolean; model?: string; phiApproved?: boolean; message: string }

export async function checkAiStatus(settings: OrgSettings): Promise<AiStatus> {
  const endpoint = resolveClaudeEndpoint(settings);
  if (endpoint === '/api/analyze') {
    try {
      const r = await fetch('/api/ai-status');
      if (!r.ok) throw new Error();
      const s = (await r.json()) as { configured: boolean; model: string; phiApproved: boolean };
      return { ...s, message: s.configured ? `Local dev endpoint ready (model ${s.model})` : 'Local dev endpoint found, but ANTHROPIC_API_KEY is not set on the server.' };
    } catch {
      return { configured: false, message: 'No local AI endpoint available (production builds need the Supabase Edge Function).' };
    }
  }
  return { configured: true, message: `Using ${endpoint}. Availability is checked when an analysis runs.` };
}
