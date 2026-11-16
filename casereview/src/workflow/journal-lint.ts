// Journal checker: finds what needs attention and says exactly where — section, field and sentence.
// Covers missing items, spelling, shorthand/wording and formatting. Content checks (contradictions,
// journal vs CDS, QA requirements) come from the consistency findings and are merged by the caller.
import type { JournalFieldDef, JournalTemplate } from '../config/journal-template.ts';
import { CLARIFY_RE, readJournalField } from './journal-builder.ts';
import { polishValue, SPELLING } from './professional-wording.ts';

export type LintKind = 'Missing' | 'Spelling' | 'Wording' | 'Format';

export interface LintIssue {
  id: string;
  fieldId: string;
  field: string;
  section: string;
  kind: LintKind;
  /** The exact sentence or text that needs attention. */
  sentence: string;
  message: string;
  /** Safe automatic correction for the whole field, when there is one. */
  corrected?: string;
}

function sectionName(f: JournalFieldDef): string {
  return f.group.replace(/^\s*\d+\)\s*/, '').replace(/:$/, '');
}

function firstSentenceWith(value: string, re: RegExp): string {
  const sentences = value.split(/(?<=[.!?])\s+/);
  return sentences.find((s) => { re.lastIndex = 0; return re.test(s); }) ?? value;
}

export function lintJournal(text: string, template: JournalTemplate): LintIssue[] {
  const out: LintIssue[] = [];
  for (const f of template.fields) {
    const base = { fieldId: f.id, field: f.label, section: sectionName(f) };
    const value = readJournalField(text, f);
    if (value === null) {
      if (f.required) out.push({ ...base, id: `missing:${f.id}`, kind: 'Missing', sentence: '', message: `"${f.label}" is not in the journal. Add it${f.hint ? ` — ${f.hint}` : ''}.` });
      continue;
    }
    const v = value.trim();
    CLARIFY_RE.lastIndex = 0;
    if (!v || CLARIFY_RE.test(v)) {
      if (f.required) out.push({ ...base, id: `missing:${f.id}`, kind: 'Missing', sentence: v, message: `"${f.label}" has no information. Enter it, or write "None"${f.hint ? ` — ${f.hint}` : ''}.` });
      continue;
    }
    if (['assessment_date'].includes(f.id)) continue;
    const corrected = polishValue(f.id, v);
    const spelling = SPELLING.filter(([re]) => { re.lastIndex = 0; return re.test(v); });
    if (spelling.length) {
      const words = spelling.map(([re]) => { re.lastIndex = 0; return v.match(re)?.[0]; }).filter(Boolean);
      out.push({ ...base, id: `spelling:${f.id}`, kind: 'Spelling', sentence: firstSentenceWith(v, spelling[0][0]), message: `Spelling: ${words.join(', ')}.`, corrected });
    } else if (corrected !== v) {
      const format = /[a-z]$/.test(v) || /^[a-z]/.test(v) || /\s{2,}|\s[.,]/.test(v);
      const shorthand = /\b(appt|hrs?|w\/|w\/o|b\/c|HV|CM|meal prep|meds|dx)\b/.test(v) || /n['’]t\b/.test(v);
      out.push({
        ...base, id: `wording:${f.id}`, kind: shorthand || !format ? 'Wording' : 'Format', sentence: v,
        message: shorthand ? 'Uses shorthand. Write it out in full.' : format ? 'Incomplete sentence or missing punctuation.' : 'Can be written as a complete professional sentence.',
        corrected,
      });
    }
  }
  return out;
}
