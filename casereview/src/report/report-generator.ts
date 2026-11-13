// report-generator: builds the printable Final Case Review Report as a
// self-contained HTML document (used for on-screen view, print/PDF and Word export).
// All dynamic text is HTML-escaped.

import { formatLocation } from '../engine/assessment-parser.ts';
import type { CdsResponse } from '../engine/types.ts';
import { decisionKey, reviewProgress } from '../data/review-actions.ts';
import type { ReviewRecord } from '../data/types.ts';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const badge = (s: string) => {
  const red = ['Mismatch', 'Missing', 'Corrections Required', 'High', 'Unable to Determine', 'Conflicting'];
  const amber = ['Needs Review', 'Needs Verification', 'Additional Documentation Required', 'Medium', 'Missing in CDS', 'Pending'];
  const green = ['Complete', 'Match', 'Ready for Review', 'Ready for Case Manager Review', 'Independent', 'Completed', 'approved'];
  const cls = red.includes(s) ? 'r' : amber.includes(s) ? 'a' : green.includes(s) ? 'g' : 's';
  return `<span class="b ${cls}">${esc(s)}</span>`;
};

const CSS = `
body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;font-size:11pt;line-height:1.4;margin:0;padding:24px;background:#fff}
h1{font-size:18pt;color:#0b1528;margin:0 0 4px} h2{font-size:13pt;color:#132340;border-bottom:2px solid #223f6f;padding-bottom:3px;margin:22px 0 8px}
h3{font-size:11pt;margin:12px 0 4px;color:#1b3156}
table{width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:9.5pt} th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#f1f5fb;font-weight:600} .muted{color:#64748b;font-size:9pt} .q{font-style:italic;color:#334155}
.b{display:inline-block;border-radius:9px;padding:0 6px;font-size:8.5pt;font-weight:600;border:1px solid}
.b.r{background:#fef2f2;color:#991b1b;border-color:#fecaca}.b.a{background:#fffbeb;color:#92400e;border-color:#fde68a}
.b.g{background:#ecfdf5;color:#065f46;border-color:#a7f3d0}.b.s{background:#f1f5f9;color:#334155;border-color:#e2e8f0}
.box{border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;margin:8px 0;background:#f8fafc}
.warn{border-color:#fcd34d;background:#fffbeb}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 16px}
@media print{body{padding:0}.pb{break-before:page}}
`;

function finalValue(review: ReviewRecord, c: CdsResponse) {
  const d = review.decisions[decisionKey('cds', c.fieldId)];
  if (d && d.status !== 'rejected') return { v: d.value, s: `Human-${d.status} (${d.byName})` };
  if (d?.status === 'rejected') return { v: c.suggestedResponse, s: `Rejected (${d.byName}) – do not enter` };
  return { v: c.suggestedResponse, s: 'Unverified' };
}

export function generateReportHtml(review: ReviewRecord, opts: { title?: string } = {}): string {
  const a = review.analysis;
  const i = review.input;
  const p = reviewProgress(review);
  const facts = a.facts.filter((f) => f.location.docType !== 'CDS Record');
  const factsBy = (cats: string[]) => facts.filter((f) => cats.includes(f.category));
  const factTable = (rows: typeof facts) =>
    rows.length
      ? `<table><tr><th>Item</th><th>Documented value</th><th>Source</th></tr>${rows
          .map((f) => `<tr><td>${esc(f.label)}</td><td>${esc(f.value)}${f.detail ? ` <span class="muted">— ${esc(f.detail)}</span>` : ''}${f.assertion !== 'affirmed' ? ` <span class="muted">[${esc(f.assertion.replace('_', ' '))}]</span>` : ''}</td><td class="q">“${esc(f.sourceText)}”<br><span class="muted">${esc(formatLocation(f.location))}</span></td></tr>`)
          .join('')}</table>`
      : '<p class="muted">Nothing documented.</p>';

  const prepared = a.cds.filter((c) => c.mapped !== false);
  const unprepared = a.cds.length - prepared.length;
  const sections = [...new Set(prepared.map((c) => c.section))];
  const missing = a.qa.filter((q) => q.status === 'Missing' || q.status === 'Unable to Verify');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title ?? `Case Review Report – ${i.caseIdentifier}`)}</title><style>${CSS}</style></head><body>
<h1>Case Review Report</h1>
<p class="muted">Generated ${esc(new Date().toLocaleString())} · Analysis ${esc(new Date(a.generatedAt).toLocaleString())} · Engine ${esc(a.engineVersion)} · ${esc(a.configVersions.cdsTemplate)} · ${esc(a.configVersions.qaChecklist)}</p>
<div class="box warn"><strong>For case manager review.</strong> This report is a documentation preparation and QA aid. It is not a final assessment, does not certify eligibility and does not certify that the file passes QA. CDS field mappings are provisional until the official instrument is configured. Not affiliated with, endorsed by, or integrated with AgeSpan or WellSky.${a.provider.mode === 'mock' ? ' <strong>MOCK AI MODE:</strong> extraction performed by the rule-based engine.' : ''}</div>

<h2>1. Consumer and assessment information</h2>
<div class="grid"><div><b>Case identifier:</b> ${esc(i.caseIdentifier)}</div><div><b>Assessment type:</b> ${esc(i.assessmentType)}</div><div><b>Assessment date:</b> ${esc(i.assessmentDate || 'Not entered')}</div>
<div><b>Program:</b> ${esc(i.program || 'Not entered')}</div><div><b>Prepared by:</b> ${esc(review.createdByName)}</div><div><b>Documents:</b> ${esc(i.documents.map((d) => `${d.name} (${d.type})`).join('; '))}</div></div>

<h2>2. Extracted assessment summary</h2>${factTable(factsBy(['basic']))}
<h2>3. Medical and functional information</h2><h3>Medical and health</h3>${factTable(factsBy(['medical']))}
<h3>Services and supports</h3>${factTable(factsBy(['services', 'program', 'suspension']))}
<h3>Financial, eligibility and consent (as documented – not verified)</h3>${factTable(factsBy(['financial', 'eligibility', 'consent', 'risk']))}

<h2 class="pb">4. ADL/IADL comparison</h2>
<table><tr><th>ADL/IADL</th><th>Narrative status</th><th>CDS status</th><th>Comparison result</th><th>Evidence</th></tr>${a.adl
    .map((r) => `<tr><td>${esc(r.label)}</td><td>${badge(r.narrativeStatus)}${r.narrativeDetail && r.narrativeStatus !== 'Not Documented' ? `<br><span class="muted">${esc(r.narrativeDetail)}</span>` : ''}</td><td>${esc(r.cdsStatus)}${r.cdsRawValue ? `<br><span class="muted">“${esc(r.cdsRawValue)}”</span>` : ''}</td><td>${badge(r.result)}<br><span class="muted">${esc(r.explanation)}</span></td><td class="q">${r.evidence.map((e) => `“${esc(e.text)}”`).join('<br>') || '<span class="muted">None</span>'}</td></tr>`)
    .join('')}</table>

<h2 class="pb">5. CDS preparation responses (WellSky Transfer Guide)</h2>
<p class="muted">Enter only human-verified responses into WellSky. "Not documented" must not be entered as "No" or "Not present". Where several codes are listed, the narrative does not state the level — select the verified code.${unprepared ? ` ${unprepared} other instrument question(s) are not prepared from the narrative and must be completed from the assessment.` : ''}</p>
${sections
    .map((s) => `<h3>${esc(s)}</h3><table><tr><th>Question</th><th>Response</th><th>Status</th><th>Verification</th><th>Supporting narrative</th></tr>${prepared
      .filter((c) => c.section === s)
      .map((c) => { const f = finalValue(review, c); return `<tr><td>${c.code ? `<b>${esc(c.code)}</b> ` : ''}${esc(c.label)}</td><td>${esc(f.v)}</td><td>${badge(c.status)}</td><td>${esc(f.s)}</td><td class="q">${c.evidence[0] ? `“${esc(c.evidence[0].text)}”` : '<span class="muted">None</span>'}</td></tr>`; })
      .join('')}</table>`)
    .join('')}

<h2 class="pb">6. Annual QA checklist results</h2>
<table><tr><th>#</th><th>Category</th><th>Result</th><th>Evidence found</th><th>Evidence missing</th><th>Recommended correction</th><th>Reviewer</th></tr>${a.qa
    .map((q) => { const d = review.decisions[decisionKey('qa', q.categoryId)]; return `<tr><td>${q.number}</td><td>${esc(q.title)}</td><td>${badge(q.status)}</td><td class="q">${q.evidenceFound.slice(0, 3).map((e) => `“${esc(e.text)}”`).join('<br>') || '<span class="muted">None</span>'}</td><td>${esc(q.evidenceMissing.join('; ')) || '<span class="muted">None</span>'}</td><td>${esc(q.recommendedCorrection)}</td><td>${d ? `${badge(d.status)} ${esc(d.byName)}${d.status === 'edited' ? `: ${esc(d.value)}` : ''}` : '<span class="muted">Pending</span>'}</td></tr>`; })
    .join('')}</table>

<h2>7. Missing documentation</h2>
${missing.length ? `<ul>${missing.map((q) => `<li><b>${q.number}. ${esc(q.title)}</b> (${esc(q.status)}): ${esc(q.evidenceMissing.join('; '))}</li>`).join('')}</ul>` : '<p class="muted">None identified.</p>'}

<h2>8. Inconsistencies and corrections</h2>
${a.discrepancies.length ? `<h3>Conflicting values (not resolved by the system)</h3><ul>${a.discrepancies.map((d) => `<li><b>${esc(d.topic)}:</b> ${d.values.map((v) => `“${esc(v.value)}” (${esc(formatLocation(v.evidence.location))})`).join(' vs. ')}</li>`).join('')}</ul>` : ''}
${(['High', 'Medium', 'Low'] as const)
    .map((pr) => { const list = a.issues.filter((x) => x.priority === pr); return list.length ? `<h3>${pr} priority</h3><table><tr><th>Issue</th><th>Why it matters</th><th>Where</th><th>Verify</th><th>Suggested correction</th></tr>${list.map((x) => `<tr><td><b>${esc(x.title)}</b><br>${esc(x.problem)}</td><td>${esc(x.whyItMatters)}</td><td>${esc(x.where)}</td><td>${esc(x.verify)}</td><td>${esc(x.suggestedCorrection)}</td></tr>`).join('')}</table>` : ''; })
    .join('')}

<h2>9. Follow-up tasks</h2>
${review.tasks.length ? `<table><tr><th>Task</th><th>Responsible</th><th>Due date</th><th>Status</th><th>Follow-up</th><th>Completion notes</th></tr>${review.tasks.map((t) => `<tr><td>${esc(t.description)}</td><td>${esc(t.responsible)}</td><td>${esc(t.dueDate ?? 'Not documented')}</td><td>${badge(t.status)}</td><td>${esc(t.followUp)}</td><td>${esc(t.completionNotes)}</td></tr>`).join('')}</table>` : '<p class="muted">No follow-up actions documented.</p>'}

<h2>10. Case manager review notes</h2>
<div class="box">${esc(review.reviewerNotes || 'No notes entered.')}</div>
<p class="muted">Human review progress: ${p.reviewed} of ${p.total} items reviewed (${p.pct}%).</p>

<h2>11. Final review status</h2>
<p>${badge(a.finalStatus)}</p><ul>${a.finalStatusReasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
<p class="muted">This status is a documentation review aid. It is never a QA pass or an eligibility determination.</p>
</body></html>`;
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Word-compatible export (HTML in a .doc container, opened natively by Microsoft Word). */
export function exportWord(review: ReviewRecord) {
  const html = generateReportHtml(review).replace('<html>', '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">');
  downloadFile(`case-review-${review.input.caseIdentifier.replace(/[^\w-]+/g, '_')}.doc`, html, 'application/msword');
}
