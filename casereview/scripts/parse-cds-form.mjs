#!/usr/bin/env node
// Converts a CDS assessment form export (PDF "Assessment Linked Fields" printout)
// into a JSON instrument definition: sections, groups, questions and answer choices.
//
// Usage:  node scripts/parse-cds-form.mjs <form.pdf | form.txt> <out.json> [--name "..."] [--version "..."]
// Requires `pdftotext` (poppler-utils) for PDF input.
//
// PRIVACY: form printouts carry the consumer's name/ID in each page header. This script drops
// every page header/footer line and fails if any header text survives in the output.
// Use a blank form whenever possible.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/parse-cds-form.mjs <form.pdf|form.txt> <out.json> [--name ...] [--version ...]');
  process.exit(1);
}
const opt = (flag, dflt) => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1] : dflt; };

const raw = input.toLowerCase().endsWith('.pdf')
  ? execFileSync('pdftotext', ['-layout', input, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  : readFileSync(input, 'utf8');

// ---------------------------------------------------------------------------
// 1. Remove page headers/footers (and remember header text for the leak check)
// ---------------------------------------------------------------------------
const headerTexts = new Set();
const lines = [];
const pages = raw.split('\f');
let formCode = '';
let formTitle = '';
for (const page of pages) {
  const pl = page.split(/\r?\n/);
  let started = false;
  for (const line of pl) {
    if (!line.trim()) continue;
    const ind = line.length - line.trimStart().length;
    const t = line.trim();
    if (/\.afm\b|Page \d+ of \d+/.test(t)) {
      const m = t.match(/\\([^\\]+?)\.afm/);
      if (m && !formTitle) formTitle = m[1];
      continue;
    }
    // Page headers (consumer name/ID, dates, form code) are flush-left or centered far right;
    // form content is indented 1-30 columns.
    const isStructural = ind > 0 && ind <= 30;
    if (!started) {
      // Everything before the first structural line on a page is header (consumer name/ID, dates, form code).
      if (isStructural && !(ind === 0)) { started = true; } else {
        if (/^[A-Z]{2,}-\d/.test(t) && !formCode) formCode = t.split(/\s+/)[0];
        headerTexts.add(t);
        continue;
      }
    }
    if (ind === 0 && !/^[A-Z]{1,2}\.\s/.test(t)) { headerTexts.add(t); continue; }
    if (/^[A-Z]{2,}-\d[\w-]*\s+\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) continue;
    lines.push(line.replace(/\s+$/, ''));
  }
}

// ---------------------------------------------------------------------------
// 2. Parse structure
// ---------------------------------------------------------------------------
const sections = [];
let section = null;
let group = null;
let question = null;
const questions = [];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
const isBareMarker = (s) => /^(\([A-Z]\)\s*)?[a-z]{1,2}\.?$/.test(s.trim()) || /^\([A-Z]\)\s*[a-z]{1,2}\.$/.test(s.trim());

function newQuestion(text) {
  question = { section: section?.title ?? '', sectionCode: section?.code ?? '', group: group?.title ?? '', groupCode: group?.code ?? '', label: text.trim(), type: 'text', choices: [] };
  questions.push(question);
}

for (const line of lines) {
  const ind = line.length - line.trimStart().length;
  const t = line.trim();
  let m;
  if (ind <= 4 && (m = t.match(/^([A-Z]{1,2})\.\s+(.+)$/))) {
    section = { code: m[1], title: t };
    sections.push(section);
    group = null; question = null;
    continue;
  }
  if (ind <= 7 && (m = t.match(/^([A-Z]{1,2}(?:\.\d+\.?)?)\s+([A-Z(].*)$/)) && !/ - /.test(t)) {
    group = { code: m[1].replace(/\.$/, ''), title: t };
    question = null;
    continue;
  }
  if (ind <= 4) { section = { code: '', title: t }; sections.push(section); group = null; question = null; continue; }
  if (ind <= 7) { group = { code: '', title: t }; question = null; continue; }

  if (/^_{3,}[\s/_-]*$/.test(t) || /^_+-_+-_+$/.test(t)) {
    if (question) question.type = /\//.test(t) ? 'date' : 'text';
    continue;
  }
  const noChoicesYet = question && question.choices.length === 0;
  if (ind < 16) {
    // Question line or continuation of the current question.
    const startsItem = /^(\([A-Z]\)\s*)?[a-z]{1,2}\.(\s|$)/.test(t);
    const continues = !startsItem && (
      isBareMarker(question?.label ?? 'x') ||
      /^[a-z,\-–[]/.test(t) ||
      /^\((?!select|check)[a-z]/.test(t) ||
      /^(check all|select all|\(select|\(check)/i.test(t) ||
      (/^[A-Z]{2,}\b/.test(t) && !/[.?:)]$/.test(question?.label ?? '.')));
    if (noChoicesYet && continues) {
      question.label = `${question.label} ${t}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    newQuestion(t);
    continue;
  }
  // Indented 16+: answer choice, unless it continues a bare marker ("c." + wrapped question text).
  if (question && noChoicesYet && isBareMarker(question.label)) {
    question.label = `${question.label} ${t}`.trim();
    continue;
  }
  if (!question) newQuestion('(unlabeled)');
  question.choices.push(t.replace(/\s{2,}/g, ' '));
}

// ---------------------------------------------------------------------------
// 3. Merge questions repeated across page breaks; classify types; assign ids
// ---------------------------------------------------------------------------
const merged = [];
for (const q of questions) {
  const prev = merged[merged.length - 1];
  if (prev && prev.label === q.label && prev.group === q.group && prev.section === q.section) {
    prev.choices.push(...q.choices);
    continue;
  }
  merged.push(q);
}
const seen = new Map();
const fields = merged.map((q) => {
  if (q.choices.length) q.type = /check all|select all|\(t\/f\)|all that apply/i.test(q.label) ? 'multi' : 'single';
  const base = `${(q.groupCode || q.sectionCode || 'X').replace(/\./g, '')}_${slug(q.label.replace(/^\([A-Z]\)\s*/, '').replace(/^[a-z]{1,2}\.\s*/, ''))}`;
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  const code = [q.groupCode || q.sectionCode, (q.label.match(/^(\([A-Z]\)\s*)?[a-z]{1,2}\./)?.[0] ?? '').trim()].filter(Boolean).join(' ');
  return {
    id: n > 1 ? `${base}_${n}` : base,
    code,
    section: q.section,
    group: q.group,
    label: q.label,
    type: q.type,
    choices: [...new Set(q.choices)],
  };
});

const instrument = {
  id: slug(opt('--name', formTitle || formCode || 'cds-instrument')),
  name: opt('--name', formTitle || 'CDS instrument'),
  formCode,
  version: opt('--version', (formTitle.match(/v(\d+(?:\.\d+)*)/) ?? [])[1] ?? 'unknown'),
  generatedFrom: 'Assessment form export (blank form structure only; page headers removed)',
  sectionCount: sections.length,
  fields,
};

// ---------------------------------------------------------------------------
// 4. Privacy check: no page-header text may appear in the output.
// ---------------------------------------------------------------------------
const json = JSON.stringify(instrument, null, 1);
for (const h of headerTexts) {
  if (h.length >= 6 && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(h) && !/^[A-Z]{2,}-\d/.test(h) && json.includes(h)) {
    console.error('Refusing to write: page header text found in output.' + (process.env.DEBUG_HEADERS ? ' -> ' + h : ''));
    process.exit(2);
  }
}
writeFileSync(output, json + '\n');
console.log(`Wrote ${fields.length} questions in ${sections.length} sections to ${output}`);
