import { Copy, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/AppContext.tsx';
import { formatLocation } from '../../engine/assessment-parser.ts';
import { addTask, decisionKey, setReviewerNotes, updateTask } from '../../data/review-actions.ts';
import type { AuditEntry, ReviewRecord } from '../../data/types.ts';
import type { CdsResponse, TaskStatus } from '../../engine/types.ts';
import type { FactCategory as FactCategoryLabel } from '@shared/fact-catalog.ts';
import { Badge, Button, Card, Collapsible, EmptyState, Input, Notice, Select, Table, Td, TextArea, Th } from '../ui.tsx';
import { DecisionControls, useReviewMutation } from './DecisionControls.tsx';
import { EvidenceButton } from './EvidencePanel.tsx';

const CATEGORY_LABELS: Record<FactCategoryLabel, string> = {
  basic: 'A. Basic information', medical: 'B. Medical and health', functional: 'C. Functional status', services: 'D. Services and supports',
  financial: 'E. Financial and eligibility', eligibility: 'E. Financial and eligibility', risk: 'F. Risk', goals: 'G. Person-centered goals',
  followup: 'H. Documentation and follow-up', contacts: 'H. Documentation and follow-up', consent: 'E. Financial and eligibility',
  mls: 'H. Documentation and follow-up', visits: 'H. Documentation and follow-up', suspension: 'D. Services and supports', program: 'D. Services and supports',
};

export function finalCdsValue(review: ReviewRecord, c: CdsResponse): { value: string; verified: boolean; rejected: boolean } {
  const d = review.decisions[decisionKey('cds', c.fieldId)];
  if (d?.status === 'approved' || d?.status === 'edited') return { value: d.value, verified: true, rejected: false };
  if (d?.status === 'rejected') return { value: c.suggestedResponse, verified: false, rejected: true };
  return { value: c.suggestedResponse, verified: false, rejected: false };
}

export function cdsCopyLine(review: ReviewRecord, c: CdsResponse) {
  const f = finalCdsValue(review, c);
  return `${c.section} — ${c.label}: ${f.value} [${f.verified ? 'Human-verified' : f.rejected ? 'REJECTED – do not enter' : `Unverified – ${c.status}`}]`;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button size="sm" variant="ghost" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard unavailable */ }
    }}><Copy size={12} /> {done ? 'Copied' : label}</Button>
  );
}

// ---------------------------------------------------------------------------
export function SummaryTab({ review }: { review: ReviewRecord }) {
  const a = review.analysis;
  const groups = useMemo(() => {
    const m = new Map<string, typeof a.facts>();
    for (const f of a.facts.filter((x) => x.location.docType !== 'CDS Record')) {
      const g = CATEGORY_LABELS[f.category as FactCategoryLabel] ?? f.category;
      m.set(g, [...(m.get(g) ?? []), f]);
    }
    return [...m.entries()].sort(([x], [y]) => x.localeCompare(y));
  }, [a.facts]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Card title="Final review status"><Badge className="text-sm">{a.finalStatus}</Badge><ul className="mt-2 list-disc pl-4 text-xs text-slate-600">{a.finalStatusReasons.map((r) => <li key={r}>{r}</li>)}</ul></Card>
        <Card title="Extracted facts"><p className="text-2xl font-semibold">{a.facts.length}</p><p className="text-xs text-slate-500">each tied to a source sentence</p></Card>
        <Card title="Correction items"><p className="text-2xl font-semibold">{a.issues.length}</p><p className="text-xs text-slate-500">{a.issues.filter((i) => i.priority === 'High').length} high priority</p></Card>
        <Card title="Extraction provider"><p className="text-sm font-medium">{a.provider.label}</p>{a.provider.model && <p className="text-xs text-slate-500">Model: {a.provider.model}</p>}<p className="mt-1 text-xs text-slate-500">Engine {a.engineVersion}</p></Card>
      </div>
      {a.provider.mode === 'mock' && <Notice tone="amber" title="Mock AI results">These results were produced by the built-in rule-based extractor (mock AI mode), not by an AI model.</Notice>}
      {a.rejectedFacts.length > 0 && (
        <Notice tone="purple" title={`${a.rejectedFacts.length} AI output item(s) rejected by validation`}>
          Items were discarded because their evidence was not found verbatim in the documents or they used unknown fields. <Collapsible summary="Details">{a.rejectedFacts.map((r, i) => <p key={i} className="text-xs">• {r.reason}</p>)}</Collapsible>
        </Notice>
      )}
      {a.injectionWarnings.length > 0 && <Notice tone="red" title="Embedded instructions detected and ignored">{a.injectionWarnings.map((w) => <p key={w} className="text-xs">{w}</p>)}</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(([g, facts]) => (
          <Card key={g} title={g}>
            <ul className="divide-y divide-slate-100">
              {facts.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-500">{f.label}</p>
                    <p className="text-sm text-slate-900">{f.value}{f.detail && <span className="text-slate-500"> — {f.detail}</span>}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {f.assertion !== 'affirmed' && <Badge tone={f.assertion === 'declined' || f.assertion === 'not_completed' ? 'red' : 'blue'}>{f.assertion.replace('_', ' ')}</Badge>}
                      <Badge>{f.confidence}</Badge>
                      {f.location.docType !== 'Narrative / Journal Note' && <Badge tone="purple">{f.location.docName}</Badge>}
                    </div>
                  </div>
                  <EvidenceButton title={f.label} evidence={[{ factId: f.id, text: f.sourceText, location: f.location }]} />
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function CdsTab({ review }: { review: ReviewRecord }) {
  const { settings } = useApp();
  const [filter, setFilter] = useState('all');
  const a = review.analysis;
  const items = a.cds.filter((c) => filter === 'all' || c.status === filter || (filter === 'unreviewed' && !review.decisions[decisionKey('cds', c.fieldId)]));
  const sections = [...new Set(items.map((c) => c.section))];
  return (
    <div className="space-y-4">
      {a.cds.some((c) => c.provisional) && <Notice tone="amber" title="Provisional CDS mapping">{settings.cdsTemplate.notice}</Notice>}
      <Notice tone="blue" title="WellSky Transfer Guide">
        Suggested responses are preparation aids. Approve or edit each response after verifying it, then enter verified information into WellSky manually. "Not documented" must never be entered as "No". This tool does not integrate with WellSky.
      </Notice>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-auto">
          <option value="all">All fields ({a.cds.length})</option>
          {['Ready for Review', 'Needs Verification', 'Not Documented', 'Unable to Determine'].map((s) => <option key={s} value={s}>{s} ({a.cds.filter((c) => c.status === s).length})</option>)}
          <option value="unreviewed">Not yet reviewed</option>
        </Select>
        <CopyButton label="Copy all (transfer guide)" text={a.cds.map((c) => cdsCopyLine(review, c)).join('\n')} />
      </div>
      {sections.map((s) => {
        const rows = items.filter((c) => c.section === s);
        return (
          <Card key={s} title={s} actions={<CopyButton label="Copy section" text={rows.map((c) => cdsCopyLine(review, c)).join('\n')} />}>
            <Table>
              <thead><tr><Th>Field</Th><Th>Suggested response</Th><Th>Supporting sentence</Th><Th>Confidence</Th><Th>Status</Th><Th>Case manager review</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr key={c.fieldId}>
                    <Td className="w-40 font-medium text-slate-900">{c.label}{c.provisional && <div className="text-[10px] font-normal uppercase text-amber-700">provisional</div>}</Td>
                    <Td className="w-56">
                      <span className={c.status === 'Not Documented' ? 'italic text-slate-500' : ''}>{c.suggestedResponse}</span>
                      {c.cdsRecordValue !== null && <div className="mt-1 text-xs text-violet-700">Supplied CDS: {c.cdsRecordValue}</div>}
                      <Collapsible summary="Why"><p className="text-xs text-slate-600">{c.rationale}</p></Collapsible>
                    </Td>
                    <Td className="max-w-xs text-xs">
                      {c.evidence[0] ? <><p className="line-clamp-3 text-slate-800" title={c.evidence[0].text}>“{c.evidence[0].text}”</p><p className="mt-0.5 text-slate-500">{formatLocation(c.evidence[0].location)}</p></> : <span className="text-slate-400">None in submitted documentation</span>}
                      <div className="mt-1"><EvidenceButton title={c.label} evidence={c.evidence} note={c.rationale} /></div>
                    </Td>
                    <Td>{c.confidence === 'n/a' ? <span className="text-xs text-slate-400">n/a</span> : <Badge>{c.confidence}</Badge>}</Td>
                    <Td><Badge>{c.status}</Badge></Td>
                    <Td className="w-64">
                      <DecisionControls review={review} kind="cds" itemId={c.fieldId} suggested={c.suggestedResponse} />
                      <div className="mt-1"><CopyButton text={cdsCopyLine(review, c)} /></div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        );
      })}
      {!items.length && <EmptyState title="No fields match this filter" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function AdlTab({ review }: { review: ReviewRecord }) {
  const a = review.analysis;
  const counts = ['Match', 'Mismatch', 'Missing in Narrative', 'Missing in CDS', 'Needs Verification', 'Not Applicable'].map((s) => ({ s, n: a.adl.filter((r) => r.result === s).length }));
  return (
    <div className="space-y-4">
      {!a.cdsRecord && <Notice tone="purple" title="No CDS record supplied">Narrative statuses are shown. Add a CDS Record document (Field: Value lines) to compare against CDS responses. Undocumented activities are never assumed independent.</Notice>}
      <div className="flex flex-wrap gap-2">{counts.map(({ s, n }) => <span key={s} className="text-sm"><Badge>{s}</Badge> <span className="font-semibold">{n}</span></span>)}</div>
      <Table>
        <thead><tr><Th>ADL/IADL</Th><Th>Narrative status</Th><Th>CDS status</Th><Th>Comparison result</Th><Th>Evidence</Th><Th>Review</Th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {a.adl.map((r) => (
            <tr key={r.areaId} className={r.result === 'Mismatch' ? 'bg-red-50/40' : undefined}>
              <Td className="font-medium text-slate-900">{r.label}<div className="text-[10px] uppercase text-slate-500">{r.type}</div></Td>
              <Td><Badge>{r.narrativeStatus}</Badge>{r.narrativeDetail && r.narrativeStatus !== 'Not Documented' && <p className="mt-1 text-xs text-slate-500">{r.narrativeDetail}</p>}</Td>
              <Td>{r.cdsStatus === 'CDS Not Supplied' ? <span className="text-xs text-slate-400">Not supplied</span> : <><Badge tone={r.cdsStatus === 'Not Recorded' ? 'slate' : undefined}>{r.cdsStatus}</Badge>{r.cdsRawValue && <p className="mt-1 text-xs text-slate-500">“{r.cdsRawValue}”</p>}</>}</Td>
              <Td><Badge>{r.result}</Badge><p className="mt-1 max-w-xs text-xs text-slate-600">{r.explanation}</p></Td>
              <Td><EvidenceButton title={r.label} evidence={r.evidence} note={r.explanation} /></Td>
              <Td className="w-48"><DecisionControls compact review={review} kind="adl" itemId={r.areaId} suggested={r.result} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function QaTab({ review }: { review: ReviewRecord }) {
  const { settings } = useApp();
  return (
    <div className="space-y-3">
      <Notice tone="blue">{settings.qaChecklist.basis} {settings.qaChecklist.disclaimer}</Notice>
      {review.analysis.qa.map((q) => (
        <Card key={q.categoryId}
          title={<span>{q.number}. {q.title}</span>}
          actions={<><Badge>{q.status}</Badge><EvidenceButton title={`${q.number}. ${q.title}`} evidence={q.evidenceFound} note={q.recommendedCorrection} /></>}>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Requirement</p>
              <ul className="list-disc space-y-0.5 pl-4 text-sm text-slate-700">{q.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Evidence found</p>
              {q.evidenceFound.length ? (
                <ul className="space-y-1 text-xs text-slate-700">{q.evidenceFound.slice(0, 5).map((e, i) => <li key={i}>“{e.text}” <span className="text-slate-400">({formatLocation(e.location)})</span></li>)}</ul>
              ) : <p className="text-xs text-slate-400">None</p>}
              <p className="mb-1 mt-3 text-xs font-semibold uppercase text-slate-500">Evidence missing</p>
              {q.evidenceMissing.length ? <ul className="list-disc space-y-0.5 pl-4 text-xs text-red-800">{q.evidenceMissing.map((e) => <li key={e}>{e}</li>)}</ul> : <p className="text-xs text-slate-400">None identified</p>}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Recommended correction</p>
              <p className="text-sm text-slate-700">{q.recommendedCorrection}</p>
              {q.notes && <p className="mt-1 text-xs text-slate-500">{q.notes}</p>}
              <p className="mt-2 text-xs text-slate-500">Source: {q.sourceDocuments.join(', ') || '—'}</p>
              <p className="mb-1 mt-3 text-xs font-semibold uppercase text-slate-500">Reviewer approval</p>
              <DecisionControls review={review} kind="qa" itemId={q.categoryId} suggested={q.status} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function CorrectionsTab({ review }: { review: ReviewRecord }) {
  const pr = ['High', 'Medium', 'Low'] as const;
  return (
    <div className="space-y-5">
      <Notice tone="blue">Suggested corrections never add new clinical or financial facts. Resolve each item by verifying the source and documenting what was verified.</Notice>
      {pr.map((p) => {
        const list = review.analysis.issues.filter((i) => i.priority === p);
        return (
          <div key={p}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><Badge>{p}</Badge> {p} priority <span className="text-slate-400">({list.length})</span></h3>
            {list.length === 0 ? <p className="text-sm text-slate-400">None</p> : (
              <div className="space-y-2">
                {list.map((i) => (
                  <Card key={i.id} title={i.title} actions={<><Badge tone="slate">{i.source}</Badge><EvidenceButton title={i.title} evidence={i.evidence} /></>}>
                    <dl className="grid gap-3 text-sm md:grid-cols-2">
                      <div><dt className="text-xs font-semibold uppercase text-slate-500">What is missing or inconsistent</dt><dd className="text-slate-800">{i.problem}</dd></div>
                      <div><dt className="text-xs font-semibold uppercase text-slate-500">Why it matters</dt><dd className="text-slate-700">{i.whyItMatters}</dd></div>
                      <div><dt className="text-xs font-semibold uppercase text-slate-500">Where identified</dt><dd className="text-slate-700">{i.where}</dd></div>
                      <div><dt className="text-xs font-semibold uppercase text-slate-500">What to verify</dt><dd className="text-slate-700">{i.verify}</dd></div>
                      <div className="md:col-span-2"><dt className="text-xs font-semibold uppercase text-slate-500">Suggested correction</dt><dd className="text-slate-700">{i.suggestedCorrection}</dd></div>
                    </dl>
                    <div className="mt-3 border-t border-slate-100 pt-2"><DecisionControls review={review} kind="issue" itemId={i.id} suggested="Resolved" /></div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
const TASK_STATUSES: TaskStatus[] = ['Pending', 'In Progress', 'Completed', 'Cancelled'];

export function FollowUpTab({ review }: { review: ReviewRecord }) {
  const { user } = useApp();
  const m = useReviewMutation(review);
  const [desc, setDesc] = useState('');
  const [resp, setResp] = useState('');
  if (!user) return null;
  return (
    <div className="space-y-4">
      <Notice tone="blue">Tasks are generated from planned actions documented in the narrative. Due dates appear only when documented.</Notice>
      {review.tasks.length === 0 && <EmptyState title="No follow-up actions documented" />}
      {review.tasks.map((t) => (
        <Card key={t.id} title={t.description} actions={<><Badge>{t.status}</Badge><EvidenceButton title={t.description} evidence={t.evidence} /></>}>
          <div className="grid gap-3 md:grid-cols-4">
            <div><p className="text-xs font-semibold uppercase text-slate-500">Responsible</p><p className="text-sm">{t.responsible}</p></div>
            <div><p className="text-xs font-semibold uppercase text-slate-500">Due date</p><p className="text-sm">{t.dueDate ?? <span className="italic text-slate-500">Not documented</span>}</p></div>
            <div><p className="text-xs font-semibold uppercase text-slate-500">Follow-up</p><p className="text-sm text-slate-700">{t.followUp}</p></div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Status</p>
              <Select value={t.status} onChange={(e) => m.run(() => updateTask(user, review, t.id, { status: e.target.value as TaskStatus }))}>
                {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </div>
          </div>
          <TaskNotes initial={t.completionNotes} onSave={(v) => m.run(() => updateTask(user, review, t.id, { completionNotes: v }))} />
        </Card>
      ))}
      <Card title="Add a task manually">
        <div className="grid gap-2 md:grid-cols-[1fr_200px_auto]">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Task description" />
          <Input value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Responsible person" />
          <Button disabled={!desc.trim()} onClick={async () => { await m.run(() => addTask(user, review, desc.trim(), resp.trim())); setDesc(''); setResp(''); }}><Plus size={14} /> Add</Button>
        </div>
      </Card>
      {m.error && <Notice tone="red">{m.error}</Notice>}
    </div>
  );
}

function TaskNotes({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  return (
    <div className="mt-3 flex gap-2">
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Completion notes" />
      <Button size="sm" disabled={v === initial} onClick={() => onSave(v)}>Save notes</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function ReviewerNotes({ review }: { review: ReviewRecord }) {
  const { user } = useApp();
  const m = useReviewMutation(review);
  const [v, setV] = useState(review.reviewerNotes);
  if (!user) return null;
  return (
    <Card title="Case manager review notes">
      <TextArea rows={4} value={v} onChange={(e) => setV(e.target.value)} placeholder="Notes about verification performed, records checked, corrections made…" />
      <div className="mt-2 flex justify-end"><Button size="sm" variant="primary" disabled={v === review.reviewerNotes} onClick={() => m.run(() => setReviewerNotes(user, review, v))}>Save notes</Button></div>
    </Card>
  );
}

export function HistoryTab({ review }: { review: ReviewRecord }) {
  const { repo, user } = useApp();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  useEffect(() => {
    if (user) repo.listAudit(user, review.id).then(setEntries).catch(() => setEntries([]));
  }, [repo, user, review]);
  if (!entries) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <Table>
      <thead><tr><Th>When</Th><Th>User</Th><Th>Action</Th><Th>Item</Th><Th>Before</Th><Th>After</Th><Th>Note</Th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {entries.map((e) => (
          <tr key={e.id}>
            <Td className="whitespace-nowrap text-xs">{new Date(e.at).toLocaleString()}</Td>
            <Td className="text-xs">{e.userName}</Td>
            <Td className="text-xs font-medium">{e.action}</Td>
            <Td className="text-xs">{e.entityType}:{e.entityId.length > 30 ? e.entityId.slice(0, 8) + '…' : e.entityId}</Td>
            <Td className="max-w-xs text-xs text-slate-500">{e.before}</Td>
            <Td className="max-w-xs text-xs">{e.after}</Td>
            <Td className="text-xs text-slate-500">{e.note}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
