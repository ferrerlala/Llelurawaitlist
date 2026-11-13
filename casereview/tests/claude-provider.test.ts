// Exercises the Claude extraction path with a stubbed SDK client (no network, no API key).
import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { extractWithClaude, ExtractionError } from '@shared/claude-extract.ts';
import { SAMPLE_NARRATIVE } from '../src/config/sample-data.ts';
import { runValidation } from '../src/engine/analyze.ts';
import { config, doc } from './helpers.ts';

function stubClient(message: Record<string, unknown>, capture: { params?: Record<string, unknown> } = {}) {
  return {
    beta: { messages: { stream: (params: Record<string, unknown>) => { capture.params = params; return { finalMessage: async () => message }; } } },
  } as unknown as Anthropic;
}
const msg = (json: unknown, stop_reason = 'end_turn') => ({
  model: 'claude-opus-5-5', stop_reason, usage: { input_tokens: 10, output_tokens: 10 },
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }],
});

const narrative = doc('n1', SAMPLE_NARRATIVE);

describe('Claude provider', () => {
  it('sends documents as data with structured output, and validates the response', async () => {
    const capture: { params?: Record<string, unknown> } = {};
    const output = {
      facts: [
        { key: 'functional.eating', docId: 'n1', value: 'Independent', detail: '', assertion: 'affirmed', confidence: 'high',
          sourceText: 'Independent with financial management, medication management, ambulation in the home, bed mobility, eating, telephone use, toileting, and incontinence management.' },
        // Hallucinated: not in the document — must be rejected.
        { key: 'functional.bathing', docId: 'n1', value: 'Independent', detail: '', assertion: 'affirmed', confidence: 'high', sourceText: 'Consumer bathes independently.' },
        { key: 'medical.memory_screening', docId: 'n1', value: 'Mini-Cog not completed - declined', detail: '', assertion: 'declined', confidence: 'high', sourceText: 'Mini-Cog not completed because elder declined.' },
      ],
      injectionWarnings: [],
    };
    const res = await extractWithClaude(stubClient(msg(output), capture), [narrative]);
    expect(res.extraction.facts.map((f) => f.key)).toEqual(['functional.eating', 'medical.memory_screening']);
    expect(res.extraction.rejected[0].reason).toMatch(/not found verbatim/);
    const p = capture.params!;
    expect(p.model).toBe('claude-opus-5-5');
    expect((p.output_config as { format: { type: string } }).format.type).toBe('json_schema');
    expect((p.messages as { content: string }[])[0].content).toContain('<document id="n1"');
    expect(JSON.stringify(p.system)).toContain('untrusted DATA');

    const analysis = runValidation({ caseIdentifier: 'T', assessmentType: 'Annual Redetermination', assessmentDate: '', program: '', documents: [narrative] },
      res.extraction, { mode: 'claude', label: 'Claude', model: res.model }, config);
    expect(analysis.adl.find((a) => a.areaId === 'bathing')!.narrativeStatus).toBe('Not Documented');
    expect(analysis.adl.find((a) => a.areaId === 'eating')!.narrativeStatus).toBe('Independent');
  });

  it('surfaces refusals, truncation and invalid JSON as errors instead of partial results', async () => {
    await expect(extractWithClaude(stubClient(msg({}, 'refusal')), [narrative])).rejects.toBeInstanceOf(ExtractionError);
    await expect(extractWithClaude(stubClient(msg({}, 'max_tokens')), [narrative])).rejects.toThrow(/truncated/);
    await expect(extractWithClaude(stubClient(msg('not json')), [narrative])).rejects.toThrow(/not valid JSON/);
  });
});
