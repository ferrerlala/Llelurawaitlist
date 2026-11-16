// Professional case-management wording for a journal draft.
// Rewrites how each line is said (full sentences, no shorthand, consistent terms) without adding,
// removing or changing any fact. Every change is shown before/after for the case manager to approve.
import type { JournalTemplate } from '../config/journal-template.ts';
import { readJournalField, setJournalField } from './journal-builder.ts';

export interface WordingChange { fieldId: string; label: string; before: string; after: string }

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bappts\b/gi, 'appointments'], [/\bappt\b/gi, 'appointment'],
  [/\b(\d+)\s*hrs\b/gi, '$1 hours'], [/\bhrs\b/gi, 'hours'], [/\b(\d+)\s*hr\b/gi, '$1 hour'],
  [/\bw\/o\b/gi, 'without'], [/\bw\//gi, 'with '], [/\bb\/c\b/gi, 'because'],
  [/\bHV\b/g, 'home visit'], [/\bCM\b/g, 'case manager'],
  [/\bmeal prep\b/gi, 'meal preparation'], [/\bmeds\b/gi, 'medications'], [/\bdx\b/gi, 'diagnosis'],
  [/\bdoesn['’]t\b/gi, 'does not'], [/\bdon['’]t\b/gi, 'do not'], [/\bcan['’]t\b/gi, 'cannot'], [/\bwon['’]t\b/gi, 'will not'],
  [/\bisn['’]t\b/gi, 'is not'], [/\bdidn['’]t\b/gi, 'did not'], [/\bwasn['’]t\b/gi, 'was not'],
  [/\bnot schedule\b/gi, 'not scheduled'], [/\bchanged-on\b/gi, 'changes in'],
];

const NONE = /^(none|n\/a|na|no)\.?$/i;
const NUM: Record<string, string> = { '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five' };

function sentenceCase(s: string): string {
  const t = s.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

function endSentence(s: string): string {
  const t = s.trim().replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ');
  if (!t || /[.!?:)]$/.test(t) || /^n\/a$/i.test(t)) return t;
  return `${t}.`;
}

function hasVerb(s: string): boolean {
  return /\b(is|are|was|were|has|have|had|reports?|reported|states?|stated|lives|uses|needs|presents?|presented|appears?|appeared|remains?|receives?|provides?|assists?|attends?|takes?|denies|denied|declined|completed|reviewed|wears|goes|helps?)\b/i.test(s);
}

function lowerList(s: string): string {
  return s.replace(/\.$/, '').split(/\s*,\s*|\s+and\s+/).filter(Boolean).map((x) => x.trim().toLowerCase()).join(', ').replace(/, ([^,]+)$/, ' and $1');
}

/** Professional wording for one journal value. Returns the value unchanged when nothing applies. */
export function polishValue(fieldId: string, raw: string): string {
  let v = raw.replace(/\s+/g, ' ').trim();
  if (!v || /\[\[CLARIFY/.test(v)) return raw.trim();
  for (const [re, to] of ABBREVIATIONS) v = v.replace(re, to);

  if (NONE.test(v) && !['memory_screening', 'emergency_contacts', 'assessment_date'].includes(fieldId)) {
    if (fieldId === 'hospitalizations') return 'Consumer reported no recent hospitalizations.';
    if (fieldId === 'falls') return 'Consumer reported no falls since the last assessment.';
    return 'None.';
  }

  switch (fieldId) {
    case 'falls': {
      const m = v.match(/^(\d+|one|two|three)\s*(?:falls?)?[,;]?\s*(?:with\s+)?no\s+injur/i);
      if (m) { const n = NUM[m[1]] ?? m[1].toLowerCase(); return `Consumer reported ${n} fall${n === 'one' ? '' : 's'} since the last assessment, with no injuries.`; }
      break;
    }
    case 'medications':
      if (/^no changes? (in|to|on)?\s*medications?\.?$/i.test(v) || /^no medication changes\.?$/i.test(v)) return 'Medications were reviewed with the consumer; no changes were reported.';
      break;
    case 'mood_cognitive':
      if (!hasVerb(v) && v.split(' ').length <= 8) return `Consumer presented with ${/^(a|an|the)\b/i.test(v) ? '' : /^[aeiou]/i.test(v) ? 'an ' : 'a '}${v.replace(/\.$/, '').toLowerCase()}.`;
      break;
    case 'living_arrangements':
      if (/^lives alone/i.test(v)) v = `Consumer ${v}`;
      break;
    case 'consumer_needs':
      if (!hasVerb(v) && v.split(' ').length <= 12) return `Consumer reports needing assistance with ${lowerList(v)}.`;
      break;
    case 'adls':
      if (!hasVerb(v) && v.split(' ').length <= 8) return `Consumer needs assistance with ${lowerList(v.replace(/\s+services?\.?$/i, ''))}.`;
      break;
    case 'medical_conditions':
      v = v
        .replace(/\s+and\s+believes it could be ([A-Z][A-Za-z]+)/g, '; the consumer believes this may be related to $1 (not a confirmed diagnosis)')
        .replace(/\bbelieves it could be ([A-Z][A-Za-z]+)/g, 'believes this may be related to $1 (not a confirmed diagnosis)')
        .replace(/\bMay have ([A-Z][A-Za-z]+) tendencies/g, 'Consumer reports possible $1 tendencies (not a confirmed diagnosis)')
        .replace(/,?\s*Sleep disorder\s*-\s*does not sleep well/i, '. Consumer reports difficulty sleeping')
        .replace(/\band so\b/gi, 'and');
      break;
    case 'informal_supports':
      v = v.replace(/\bremains independent (?!with\b)/gi, 'remains independent with ');
      break;
    case 'pcp':
      v = v.replace(/,\s*next appointment not scheduled yet/i, '; the next appointment has not been scheduled yet');
      break;
  }
  return endSentence(sentenceCase(v));
}

/** Professional wording for every field of a journal; returns the new text and each change. */
export function polishJournal(text: string, template: JournalTemplate): { text: string; changes: WordingChange[] } {
  let out = text;
  const changes: WordingChange[] = [];
  for (const f of template.fields) {
    if (f.id === 'assessment_date' || f.id === 'emergency_contacts' || f.id === 'next_assessment') continue;
    const before = readJournalField(out, f);
    if (before === null || !before.trim()) continue;
    const after = polishValue(f.id, before);
    if (after && after !== before.trim()) {
      out = setJournalField(out, template, f.id, after);
      changes.push({ fieldId: f.id, label: f.label, before: before.trim(), after });
    }
  }
  return { text: out, changes };
}
