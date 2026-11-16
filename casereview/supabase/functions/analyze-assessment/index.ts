// Supabase Edge Function: Stage A extraction with Claude.
// - Requires an authenticated user with a profile (organization membership).
// - Refuses unless the organization has approved external AI processing of PHI
//   (BAA in place) or the caller attests the documents are fictional/de-identified.
// - Never logs document content.
// Secrets: ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=...), optional CLAUDE_MODEL, ALLOWED_ORIGIN.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { extractWithClaude, ExtractionError, DEFAULT_CLAUDE_MODEL } from '../_shared/claude-extract.ts';
import type { SourceDocument } from '../_shared/extraction-contract.ts';
import type { FunctionalAreaDef } from '../_shared/fact-catalog.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Response | Promise<Response>): void };

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Not authenticated' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await db.auth.getUser();
  if (userErr || !userData.user) return json(401, { error: 'Not authenticated' });

  // RLS limits these reads to the caller's own organization.
  const { data: profile } = await db.from('profiles').select('organization_id').eq('id', userData.user.id).maybeSingle();
  if (!profile) return json(403, { error: 'User is not a member of an organization' });
  const { data: settings } = await db.from('org_settings').select('ai_provider_phi_approved').eq('organization_id', profile.organization_id).maybeSingle();

  let payload: { documents?: SourceDocument[]; areas?: FunctionalAreaDef[]; fictionalDataAttestation?: boolean };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  if (!settings?.ai_provider_phi_approved && payload.fictionalDataAttestation !== true) {
    return json(403, { error: 'Your organization has not approved external AI processing of consumer data. Use Mock AI mode, or confirm the documents are fictional/de-identified test data.' });
  }
  const docs = (payload.documents ?? []).filter((d) => d && typeof d.text === 'string' && d.text.trim());

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(503, { error: 'Claude is not configured on the server.' });
  try {
    const result = await extractWithClaude(new Anthropic({ apiKey }), docs, { model: Deno.env.get('CLAUDE_MODEL') ?? DEFAULT_CLAUDE_MODEL, areas: payload.areas });
    return json(200, result);
  } catch (err) {
    if (err instanceof ExtractionError) return json(422, { error: err.message, code: err.code });
    if (err instanceof Anthropic.APIError) {
      console.error(`[analyze-assessment] Claude API error status=${err.status}`);
      return json(502, { error: `AI provider error (status ${err.status ?? 'unknown'})` });
    }
    console.error('[analyze-assessment] unexpected failure');
    return json(500, { error: 'Extraction failed' });
  }
});
