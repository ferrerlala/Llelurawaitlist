// assessment-parser: splits documents into sentences with source locations
// (document, line number and section heading) and resolves evidence locations.

import { normalizeForMatch } from '@shared/extraction-contract.ts';
import type { SourceDocument, SourceLocation } from './types.ts';

export interface Sentence {
  docId: string;
  text: string;
  line: number;
  section: string | null;
}

const ABBREV = /\b(?:Dr|Mr|Mrs|Ms|St|Jr|Sr|vs|approx|e\.g|i\.e)\.$/i;

export function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 4 || t.length > 80) return false;
  if (/[a-z]/.test(t)) return false;
  if (!/[A-Z]{3}/.test(t)) return false;
  return /^[A-Z0-9 &/,()'\-–]+:?$/.test(t);
}

function splitSentences(line: string): string[] {
  const parts = line.split(/(?<=[.!?])\s+(?=[A-Z"])/);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

export function segmentDocument(doc: SourceDocument): Sentence[] {
  const sentences: Sentence[] = [];
  let section: string | null = null;
  doc.text.split(/\r?\n/).forEach((rawLine, idx) => {
    const line = rawLine.replace(/^\s*(?:[*•\-–]|\d+[.)])\s+/, '').trim();
    if (!line) return;
    if (isHeading(line)) {
      section = line.replace(/:$/, '').trim();
      return;
    }
    for (const s of splitSentences(line)) sentences.push({ docId: doc.id, text: s, line: idx + 1, section });
  });
  return sentences;
}

export function locate(sourceText: string, doc: SourceDocument): SourceLocation {
  const needle = normalizeForMatch(sourceText).replace(/[.;,]+$/, '');
  let section: string | null = null;
  let found: number | null = null;
  let foundSection: string | null = null;
  const lines = doc.text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const clean = lines[i].replace(/^\s*(?:[*•\-–]|\d+[.)])\s+/, '').trim();
    if (isHeading(clean)) section = clean.replace(/:$/, '');
    if (found === null && needle && normalizeForMatch(lines[i]).includes(needle)) {
      found = i + 1;
      foundSection = section;
    }
  }
  if (found === null && needle) {
    // Evidence may span lines; fall back to first matching prefix.
    const prefix = needle.slice(0, 40);
    for (let i = 0, sec: string | null = null; i < lines.length; i++) {
      const clean = lines[i].trim();
      if (isHeading(clean)) sec = clean.replace(/:$/, '');
      if (normalizeForMatch(lines[i]).includes(prefix)) { found = i + 1; foundSection = sec; break; }
    }
  }
  return { docId: doc.id, docName: doc.name, docType: doc.type, line: found, section: foundSection };
}

export function formatLocation(loc: SourceLocation | null): string {
  if (!loc) return 'Not located';
  const parts = [loc.docName];
  if (loc.section) parts.push(loc.section);
  if (loc.line) parts.push(`line ${loc.line}`);
  return parts.join(' › ');
}
