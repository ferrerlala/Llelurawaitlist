import type { RawFact } from '@shared/extraction-contract.ts';
import { buildFactCatalog, type FunctionalAreaDef } from '@shared/fact-catalog.ts';
import { locate } from './assessment-parser.ts';
import type { EvidenceRef, Fact, SourceDocument } from './types.ts';

export function parseAmount(s: string): number | undefined {
  const m = s.match(/\$?\s?(-?[\d,]+(?:\.\d+)?)/);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function parseDate(s: string): string | undefined {
  const m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (!m) return undefined;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const mm = String(Number(m[1])).padStart(2, '0');
  const dd = String(Number(m[2])).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

export function enrichFacts(raw: RawFact[], docs: SourceDocument[], areas?: FunctionalAreaDef[]): Fact[] {
  const catalog = new Map(buildFactCatalog(areas).map((k) => [k.key, k]));
  const docMap = new Map(docs.map((d) => [d.id, d]));
  return raw.map((r, i) => {
    const def = catalog.get(r.key);
    const doc = docMap.get(r.docId) ?? docs[0];
    const normalized: Fact['normalized'] = { text: r.value.toLowerCase().replace(/\s+/g, ' ').trim() };
    if (r.key.startsWith('financial.') && /\$|\d/.test(r.value)) normalized.amount = parseAmount(r.value);
    const date = parseDate(r.detail) ?? parseDate(r.value);
    if (date) normalized.date = date;
    return {
      id: `f${i + 1}`,
      key: r.key,
      category: def?.category ?? 'basic',
      label: def?.label ?? r.key,
      value: r.value,
      detail: r.detail,
      assertion: r.assertion,
      sourceText: r.sourceText,
      confidence: r.confidence,
      location: locate(r.sourceText, doc),
      normalized,
    };
  });
}

export class FactIndex {
  private byKey = new Map<string, Fact[]>();
  constructor(public readonly facts: Fact[]) {
    for (const f of facts) {
      const list = this.byKey.get(f.key) ?? [];
      list.push(f);
      this.byKey.set(f.key, list);
    }
  }
  get(key: string): Fact[] {
    return this.byKey.get(key) ?? [];
  }
  first(key: string): Fact | undefined {
    return this.get(key)[0];
  }
  has(key: string): boolean {
    return this.get(key).length > 0;
  }
  any(keys: string[]): Fact[] {
    return keys.flatMap((k) => this.get(k));
  }
  byPrefix(prefix: string): Fact[] {
    return this.facts.filter((f) => f.key.startsWith(prefix));
  }
}

export function evidenceOf(f: Fact): EvidenceRef {
  return { factId: f.id, text: f.sourceText, location: f.location };
}

/** Comparable value for conflict detection. */
export function comparable(f: Fact): string {
  if (f.normalized.amount !== undefined) return `$${f.normalized.amount.toFixed(2)}`;
  return (f.normalized.text ?? f.value.toLowerCase()).replace(/[.\s]+$/, '');
}
