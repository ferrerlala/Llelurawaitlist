// assessment-parser: splits documents into sentences with source locations
// (document, line number, section heading) and recognizes agency note templates
// ("Label: value" fields, a./4)/— list markers, title-case section headings,
// blank template fields).

import { normalizeForMatch } from '@shared/extraction-contract.ts';
import type { SourceDocument, SourceLocation } from './types.ts';

export interface Sentence {
  docId: string;
  /** Verbatim sentence text (after list-marker removal) — always a substring of the document. */
  text: string;
  /** Template field label for the line this sentence is on, e.g. "Location of Assessment". */
  label: string | null;
  /** Sentence text without the field label (equals text for later sentences on the line). */
  body: string;
  /** True for the first sentence on a labeled line. */
  isFirst: boolean;
  line: number;
  section: string | null;
}

export interface BlankField {
  docId: string;
  label: string;
  text: string;
  line: number;
  section: string | null;
}

const ABBREV = /\b(?:Dr|Mr|Mrs|Ms|St|Jr|Sr|vs|approx|e\.g|i\.e)\.$/i;
// Bullets (*, •, -, –, —) and lowercase/numeric list markers such as "a.", "b)", "4)", "12.".
const MARKER = /^\s*(?:[*•\-–—]+\s*|\(?(?:[a-z]|\d{1,2})[.)]\s+)/;
const SMALL_WORDS = new Set(['and', 'or', 'of', 'the', 'if', 'in', 'to', 'for', 'a', 'an', 'at', 'on', 'with', '&', '/']);

export function stripMarker(line: string): string {
  let out = line;
  // Allow "4) a. text" style double markers.
  for (let i = 0; i < 2; i++) out = out.replace(MARKER, '');
  return out.trim();
}

/** Section headings: ALL CAPS lines, or short Title Case lines with no sentence punctuation. */
export function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 4 || t.length > 110) return false;
  if (/[.!?]$/.test(t) || /\$/.test(t)) return false;
  if (!/[a-z]/.test(t)) return /[A-Z]{3}/.test(t) && /^[A-Z0-9 &/,()'\-–:]+$/.test(t);
  const words = t.replace(/:$/, '').split(/[\s/]+/).filter(Boolean);
  if (words.length > 14) return false;
  return words.every((w) => SMALL_WORDS.has(w.toLowerCase()) || /^[A-Z(&]/.test(w) || /^[A-Z0-9-]+$/.test(w)) && !/\d/.test(t.replace(/^\d+\)\s*/, ''));
}

function isHeadingLine(line: string): boolean {
  const { label, body } = splitLabel(line);
  return !(label && body && !/[/&]/.test(body)) && isHeading(line);
}

const LABEL_RE = /^([A-Z][^:]{1,80}?):\s*(.*)$/;

/** Split "Label: value" when the part before the colon looks like a field label, not a sentence. */
export function splitLabel(line: string): { label: string | null; body: string } {
  const m = line.match(LABEL_RE);
  if (!m) return { label: null, body: line };
  const label = m[1].trim();
  if (/[.!?]/.test(label.replace(/\b[A-Z]\./g, '')) || label.split(/\s+/).length > 10) return { label: null, body: line };
  return { label, body: m[2].trim() };
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
  return parseDocument(doc).sentences;
}

export function parseDocument(doc: SourceDocument): { sentences: Sentence[]; blankFields: BlankField[] } {
  const sentences: Sentence[] = [];
  const blankFields: BlankField[] = [];
  let section: string | null = null;
  const lines = doc.text.split(/\r?\n/);
  const nextContent = (i: number) => {
    for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return lines[j];
    return '';
  };
  lines.forEach((rawLine, idx) => {
    const line = stripMarker(rawLine);
    if (!line) return;
    const { label, body } = splitLabel(line);
    // "Program: Home Care" is a field; "Background: Basic Information/Medical & Fall Risk" is a heading.
    const looksLikeField = !!label && !!body && !/[/&]/.test(body);
    if (!looksLikeField && isHeading(line)) {
      section = line.replace(/:$/, '').trim();
      return;
    }
    if (label && !body) {
      // "Label:" with nothing after it. A section header if sub-items follow, otherwise a blank template field.
      const next = nextContent(idx);
      if (/^\s*[*•\-–—]/.test(next)) section = label;
      else blankFields.push({ docId: doc.id, label, text: line, line: idx + 1, section });
      return;
    }
    splitSentences(line).forEach((s, i) => {
      const isFirst = i === 0;
      const b = isFirst && label ? s.slice(s.indexOf(':') + 1).trim() : s;
      sentences.push({ docId: doc.id, text: s, label, body: b || s, isFirst, line: idx + 1, section });
    });
  });
  return { sentences, blankFields };
}

export function locate(sourceText: string, doc: SourceDocument): SourceLocation {
  const needle = normalizeForMatch(sourceText).replace(/[.;,]+$/, '');
  let section: string | null = null;
  let found: number | null = null;
  let foundSection: string | null = null;
  const lines = doc.text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const clean = stripMarker(lines[i]);
    if (clean && isHeadingLine(clean)) section = clean.replace(/:$/, '');
    if (found === null && needle && normalizeForMatch(lines[i]).includes(needle)) {
      found = i + 1;
      foundSection = section;
    }
  }
  if (found === null && needle) {
    const prefix = needle.slice(0, 40);
    for (let i = 0, sec: string | null = null; i < lines.length; i++) {
      const clean = stripMarker(lines[i]);
      if (clean && isHeadingLine(clean)) sec = clean.replace(/:$/, '');
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
