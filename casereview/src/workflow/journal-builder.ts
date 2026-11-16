// Annual journal preparation: previous assessment + case manager input → draft journal.
//
// Rules enforced here:
//  * Previous information is never carried forward as current unless the case manager
//    confirmed it unchanged. Unreviewed fields become [[CLARIFY: ...]] markers.
//  * Date-based and visit-specific fields are never silently carried forward.
//  * Nothing is invented: every line is the case manager's text, a confirmed previous line,
//    or a clarification marker.
//  * Changes are detected by extracting facts from the previous and new text and comparing them.

import type { SourceDocument } from '@shared/extraction-contract.ts';
import { DEFAULT_FUNCTIONAL_AREAS } from '@shared/fact-catalog.ts';
import { parseDocument, stripMarker, splitLabel } from '../engine/assessment-parser.ts';
import { extractWithRules } from '../engine/clinical-data-extractor.ts';
import type { JournalFieldDef, JournalTemplate } from '../config/journal-template.ts';

export type FieldReviewStatus = 'not_reviewed' | 'unchanged' | 'changed' | 'clarify';

export interface JournalFieldInput {
  fieldId: string;
  status: FieldReviewStatus;
  /** New or updated content entered by the case manager (without the label). */
  newText: string;
  /** Note explaining what needs clarification. */
  note: string;
  /** The text was pre-filled from the previous assessment and not yet edited. */
  fromPrevious?: boolean;
}

export interface PreviousValue {
  text: string | null;
  /** 'template' = labeled line found; 'facts' = recovered from sentences; null = nothing found. */
  source: 'template' | 'facts' | null;
}

export type DraftFieldState = 'new' | 'changed' | 'confirmed' | 'carried-flagged' | 'clarify' | 'omitted' | 'auto';

export interface DraftField {
  fieldId: string;
  label: string;
  section: string;
  state: DraftFieldState;
  content: string;
  previous: string | null;
  changes: string[];
  warnings: string[];
}

export interface JournalDraft {
  text: string;
  fields: DraftField[];
  clarifyCount: number;
}

export const CLARIFY_RE = /\[\[CLARIFY:[^\]]*\]\]/g;

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

export function fieldLabels(field: JournalFieldDef): string[] {
  return [field.label, ...(field.aliases ?? [])].map(norm);
}

/** Find the content of a template field in a journal/narrative text. */
/**
 * Index of the line that holds a template field, or -1.
 * - Formats with numbered sections ("1) Assessment Information") may repeat a label such as
 *   "Additional Information" in several sections, so the line is looked for inside the field's own section.
 * - Older notes sometimes leave out the colon ("Home Environment Clean and clear"), so a line that
 *   starts with the label is accepted too.
 */
function findFieldLine(lines: string[], field: JournalFieldDef): { index: number; body: string } {
  const labels = fieldLabels(field);
  const groupKey = norm(stripMarker(field.group)).replace(/:$/, '');
  const numbered = /^\s*\d+\)/.test(field.group);
  const hasGroup = numbered && lines.some((raw) => /^\s*\d+\)/.test(raw) && norm(stripMarker(raw)).replace(/:$/, '').startsWith(groupKey.slice(0, 24)));
  let inGroup = !hasGroup;
  let loose: { index: number; body: string } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (hasGroup && /^\s*\d+\)/.test(raw)) { inGroup = norm(stripMarker(raw)).replace(/:$/, '').startsWith(groupKey.slice(0, 24)); continue; }
    if (!inGroup) continue;
    const line = stripMarker(raw);
    const { label, body } = splitLabel(line);
    if (label && labels.includes(norm(label))) return { index: i, body: numbered ? withContinuation(lines, i, body) : body };
    if (!loose) {
      const n = norm(line);
      const hit = labels.filter((l) => l.length >= 6).sort((a, b) => b.length - a.length).find((l) => n.startsWith(l) && /^[\s:.\-–]/.test(n.slice(l.length) || ' '));
      if (hit) loose = { index: i, body: line.slice(hit.length).replace(/^[\s:.\-–]+/, '').trim() };
    }
  }
  return loose ? { index: loose.index, body: numbered ? withContinuation(lines, loose.index, loose.body) : loose.body } : { index: -1, body: '' };
}

/** In numbered formats an item can run onto the next line(s) without its own letter; keep those lines with the item. */
function withContinuation(lines: string[], i: number, body: string): string {
  const parts = [body];
  for (let j = i + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (!t || /^\s*(?:\(?(?:[a-z]|\d{1,2})[.)])\s/.test(lines[j]) || /^\s*\d+\)/.test(lines[j])) break;
    parts.push(t);
  }
  return parts.join(' ').trim();
}

export function readJournalField(text: string, field: JournalFieldDef): string | null {
  const { index, body } = findFieldLine(text.split(/\r?\n/), field);
  return index >= 0 ? body : null;
}

/** Previous value for every template field, from the previous journal text. */
export function previousValues(template: JournalTemplate, prevText: string | null): Record<string, PreviousValue> {
  const out: Record<string, PreviousValue> = {};
  if (!prevText) {
    for (const fdef of template.fields) out[fdef.id] = { text: null, source: null };
    return out;
  }
  const doc: SourceDocument = { id: 'prev', name: 'Previous assessment', type: 'Narrative / Journal Note', text: prevText };
  const facts = extractWithRules([doc], DEFAULT_FUNCTIONAL_AREAS).facts;
  for (const fdef of template.fields) {
    const labeled = readJournalField(prevText, fdef);
    if (labeled !== null && labeled.trim()) { out[fdef.id] = { text: labeled.trim(), source: 'template' }; continue; }
    // Older notes in other formats: recover the sentences that support this field.
    let sentences = [...new Set(facts.filter((x) => fdef.factKeys.includes(x.key)).map((x) => x.sourceText))];
    if (fdef.id === 'adls') sentences = [...new Set(facts.filter((x) => x.key.startsWith('functional.')).map((x) => x.sourceText))];
    out[fdef.id] = sentences.length ? { text: sentences.join(' '), source: 'facts' } : { text: null, source: null };
  }
  return out;
}

function factSignature(label: string, content: string): Map<string, Set<string>> {
  const doc: SourceDocument = { id: 'x', name: 'x', type: 'Narrative / Journal Note', text: `${label}: ${content}` };
  const map = new Map<string, Set<string>>();
  for (const f of extractWithRules([doc], DEFAULT_FUNCTIONAL_AREAS).facts) {
    const v = f.key.startsWith('functional.') ? f.value : f.value.toLowerCase();
    map.set(f.key, new Set([...(map.get(f.key) ?? []), v]));
  }
  return map;
}

const KEY_LABELS: Record<string, string> = {};
const prettyKey = (k: string) => KEY_LABELS[k] ?? k.replace(/^functional\./, '').replace(/^[a-z]+\./, '').replace(/_/g, ' ');

/** Fact-level differences between the previous and new content of one field. */
export function detectChanges(field: JournalFieldDef, previous: string | null, next: string): string[] {
  if (!previous) return [];
  const a = factSignature(field.label, previous);
  const b = factSignature(field.label, next);
  const changes: string[] = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const before = [...(a.get(key) ?? [])];
    const after = [...(b.get(key) ?? [])];
    const added = after.filter((v) => !before.includes(v));
    const removed = before.filter((v) => !after.includes(v));
    if (!added.length && !removed.length) continue;
    if (before.length === 1 && after.length === 1) changes.push(`${prettyKey(key)}: ${before[0]} → ${after[0]}`);
    else {
      if (added.length) changes.push(`${prettyKey(key)} added: ${added.join(', ')}`);
      if (removed.length) changes.push(`${prettyKey(key)} no longer documented: ${removed.join(', ')}`);
    }
  }
  if (!changes.length && norm(previous) !== norm(next)) changes.push('Wording updated');
  return changes;
}

export function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : iso;
}

const clarify = (msg: string) => `[[CLARIFY: ${msg.replace(/[[\]]/g, '')}]]`;
const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function composeJournal(args: {
  template: JournalTemplate;
  assessmentDate: string;
  previous: Record<string, PreviousValue>;
  inputs: Record<string, JournalFieldInput>;
}): JournalDraft {
  const { template, previous, inputs } = args;
  const fields: DraftField[] = [];
  for (const fdef of template.fields) {
    const prev = previous[fdef.id]?.text ?? null;
    const input = inputs[fdef.id] ?? { fieldId: fdef.id, status: 'not_reviewed', newText: '', note: '' };
    const newText = input.newText.trim();
    const warnings: string[] = [];
    let state: DraftFieldState;
    let content: string;

    if (fdef.id === 'assessment_date' && args.assessmentDate) {
      state = 'auto';
      content = newText || formatDate(args.assessmentDate);
    } else if (input.status === 'clarify') {
      state = 'clarify';
      content = clarify(`${input.note || 'Case manager marked this for clarification'}${prev ? ` (previously: "${short(prev)}")` : ''}`);
    } else if (newText && input.fromPrevious && prev && newText === prev.trim()) {
      state = 'carried-flagged';
      content = newText;
      warnings.push('Copied from the previous visit — make sure it is right for this visit.');
    } else if (newText) {
      state = prev ? 'changed' : 'new';
      content = newText;
    } else if (input.status === 'unchanged' && prev) {
      if (fdef.unchanged === 'never') {
        state = 'clarify';
        content = clarify(`${fdef.label} must be updated for this assessment (previously: "${short(prev)}")`);
      } else if (fdef.unchanged === 'clarify') {
        state = 'clarify';
        content = clarify(`Visit-specific information — confirm for this assessment (previously: "${short(prev)}")`);
      } else {
        state = fdef.unchanged === 'carry-flag' ? 'carried-flagged' : 'confirmed';
        content = prev;
        if (fdef.unchanged === 'carry-flag') warnings.push('Carried forward from the previous assessment — confirm it is still accurate, including any dates or ages.');
      }
    } else if (prev) {
      state = 'clarify';
      content = clarify(`Not yet reviewed. Previously documented: "${short(prev)}" — confirm whether still accurate, or enter the update`);
    } else if (!fdef.required) {
      state = 'omitted';
      content = '';
    } else {
      state = 'clarify';
      content = clarify(`No information — document this item${fdef.hint ? ` (${fdef.hint})` : ''}, or state "None"`);
    }

    const changes = state === 'changed' ? detectChanges(fdef, prev, content) : [];
    if (/\b(19|20)\d{2}\b|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(content) && (state === 'confirmed' || state === 'carried-flagged')) {
      warnings.push('Contains a date carried forward from the previous assessment.');
    }
    fields.push({ fieldId: fdef.id, label: fdef.label, section: fdef.section, state, content, previous: prev, changes, warnings });
  }

  // Render in the organization's format.
  const lines: string[] = [];
  let group = '';
  for (const fdef of template.fields) {
    const df = fields.find((x) => x.fieldId === fdef.id)!;
    if (df.state === 'omitted') continue;
    if (fdef.group !== group) {
      if (lines.length) lines.push('');
      lines.push(fdef.group);
      group = fdef.group;
    }
    lines.push(`${fdef.prefix}${fdef.label}: ${df.content}`);
  }
  const text = lines.join('\n');
  return { text, fields, clarifyCount: (text.match(CLARIFY_RE) ?? []).length };
}

/** Replace (or add) the content of one template field in the journal text. */
export function setJournalField(text: string, template: JournalTemplate, fieldId: string, content: string): string {
  const fdef = template.fields.find((x) => x.id === fieldId);
  if (!fdef) throw new Error(`Unknown journal field ${fieldId}`);
  const lines = text.split(/\r?\n/);
  const idx = findFieldLine(lines, fdef).index;
  const line = `${fdef.prefix}${fdef.label}: ${content.trim()}`;
  if (idx >= 0) {
    let end = idx + 1;
    if (/^\s*\d+\)/.test(fdef.group)) {
      while (end < lines.length && lines[end].trim() && !/^\s*(?:\(?(?:[a-z]|\d{1,2})[.)])\s/.test(lines[end]) && !/^\s*\d+\)/.test(lines[end])) end++;
    }
    lines.splice(idx, end - idx, line);
    return lines.join('\n');
  }
  // Insert after the last present field of the same group, else after the previous field in template order.
  const order = template.fields.map((x) => x.id);
  for (let i = order.indexOf(fieldId) - 1; i >= 0; i--) {
    const at = findFieldLine(lines, template.fields[i]).index;
    if (at >= 0) { lines.splice(at + 1, 0, line); return lines.join('\n'); }
  }
  return `${text}\n${line}`;
}

/** Which template field does a journal line (1-based) belong to? */
export function fieldForLine(text: string, template: JournalTemplate, line: number | null): JournalFieldDef | null {
  if (!line) return null;
  const raw = text.split(/\r?\n/)[line - 1] ?? '';
  const { label } = splitLabel(stripMarker(raw));
  if (!label) return null;
  return template.fields.find((x) => fieldLabels(x).includes(norm(label))) ?? null;
}

/** Sanity check used before approval. */
export function journalProblems(text: string): string[] {
  const problems: string[] = [];
  const markers = text.match(CLARIFY_RE) ?? [];
  if (markers.length) problems.push(`${markers.length} item(s) still need clarification ([[CLARIFY: …]] markers).`);
  const { blankFields } = parseDocument({ id: 'j', name: 'j', type: 'Narrative / Journal Note', text });
  if (blankFields.length) problems.push(`Blank field(s): ${blankFields.map((b) => b.label).join(', ')}.`);
  return problems;
}
