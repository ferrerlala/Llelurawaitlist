// Local development AI endpoint (Vite dev server middleware).
// Mirrors supabase/functions/analyze-assessment so the Claude provider can be
// tested locally. Reads ANTHROPIC_API_KEY from the server environment only.
// Never logs request bodies (they may contain PHI).

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import Anthropic from '@anthropic-ai/sdk';
import { extractWithClaude, ExtractionError, DEFAULT_CLAUDE_MODEL } from '../supabase/functions/_shared/claude-extract.ts';
import type { SourceDocument } from '../supabase/functions/_shared/extraction-contract.ts';
import type { FunctionalAreaDef } from '../supabase/functions/_shared/fact-catalog.ts';

const MAX_BODY = 2 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function devAiEndpoint(env: Record<string, string>): Plugin {
  const hasCredentials = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  const model = env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL;
  const phiApproved = env.AI_PROVIDER_PHI_APPROVED === 'true';
  return {
    name: 'casereview-dev-ai-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/ai-status', (_req, res) => {
        send(res, 200, { provider: 'claude', configured: hasCredentials, model, phiApproved, endpoint: 'local-dev' });
      });
      server.middlewares.use('/api/analyze', async (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
        if (!hasCredentials) return send(res, 503, { error: 'Claude is not configured. Set ANTHROPIC_API_KEY in .env.local (server-side) or use Mock AI mode.' });
        let payload: { documents?: SourceDocument[]; areas?: FunctionalAreaDef[]; fictionalDataAttestation?: boolean };
        try {
          payload = JSON.parse(await readBody(req));
        } catch {
          return send(res, 400, { error: 'Invalid or oversized request body' });
        }
        if (!phiApproved && payload.fictionalDataAttestation !== true) {
          return send(res, 403, { error: 'External AI processing of real consumer data is not approved for this environment. Confirm the documents contain only fictional or de-identified test data.' });
        }
        const docs = (payload.documents ?? []).filter((d) => d && typeof d.text === 'string' && d.text.trim());
        try {
          const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY || undefined, authToken: env.ANTHROPIC_AUTH_TOKEN || undefined });
          const result = await extractWithClaude(client, docs, { model, areas: payload.areas });
          send(res, 200, result);
        } catch (err) {
          if (err instanceof ExtractionError) return send(res, 422, { error: err.message, code: err.code });
          if (err instanceof Anthropic.APIError) {
            // Log status only — never request content.
            console.error(`[ai] Claude API error status=${err.status}`);
            return send(res, 502, { error: `AI provider error (status ${err.status ?? 'unknown'})` });
          }
          console.error('[ai] unexpected extraction failure');
          send(res, 500, { error: 'Extraction failed' });
        }
      });
    },
  };
}
