// Claude provider for Stage A extraction. Server-side only (local dev endpoint and
// Supabase Edge Function). The API key never reaches the browser.
//
// Deno resolves "@anthropic-ai/sdk" through supabase/functions/analyze-assessment/deno.json.

import Anthropic from '@anthropic-ai/sdk';
import {
  buildSystemPrompt, buildUserMessage, extractionJsonSchema, validateExtraction, type SourceDocument, type ValidatedExtraction,
} from './extraction-contract.ts';
import { buildFactCatalog, type FunctionalAreaDef } from './fact-catalog.ts';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

export class ExtractionError extends Error {
  constructor(message: string, public readonly code: 'refusal' | 'max_tokens' | 'invalid_json' | 'no_documents' | 'too_large') {
    super(message);
  }
}

export interface ClaudeExtractionResult {
  extraction: ValidatedExtraction;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

const MAX_TOTAL_CHARS = 400_000;

export async function extractWithClaude(
  client: Anthropic,
  docs: SourceDocument[],
  opts: { model?: string; areas?: FunctionalAreaDef[] } = {},
): Promise<ClaudeExtractionResult> {
  if (!docs.length) throw new ExtractionError('No documents supplied', 'no_documents');
  const total = docs.reduce((n, d) => n + d.text.length, 0);
  if (total > MAX_TOTAL_CHARS) throw new ExtractionError('Documents exceed the maximum size for one review; split the review.', 'too_large');

  const catalog = buildFactCatalog(opts.areas);
  const stream = client.beta.messages.stream({
    model: opts.model ?? DEFAULT_CLAUDE_MODEL,
    max_tokens: 64000,
    // Re-runs a refused request on a fallback model chosen by refusal category.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: extractionJsonSchema() },
    },
    system: [{ type: 'text', text: buildSystemPrompt(catalog), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserMessage(docs) }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') throw new ExtractionError('The AI provider declined to process this document.', 'refusal');
  if (message.stop_reason === 'max_tokens') throw new ExtractionError('The extraction output was truncated. Split the documents and retry.', 'max_tokens');

  const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ExtractionError('The AI provider returned output that is not valid JSON.', 'invalid_json');
  }
  return {
    extraction: validateExtraction(parsed, docs, opts.areas),
    model: message.model,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
  };
}
