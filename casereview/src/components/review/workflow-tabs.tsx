import clsx from 'clsx';
import { AlertOctagon, CheckCircle2, Circle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../../app/AppContext.tsx';
import { useAnalyzer } from '../../app/use-analyzer.ts';
import { applyDecision } from '../../data/review-actions.ts';
import type { AuditEntry, ReviewRecord } from '../../data/types.ts';
import { readJournalField } from '../../workflow/journal-builder.ts';
import { applyFindingAction, approveFinal, finalApprovalValid, latestJournal, reviseJournal, rerunValidation, type FindingAction } from '../../workflow/engine.ts';
import { isOpen, runIndependentQa, type IndependentQaResult } from '../../workflow/independent-qa.ts';
import type { ConsistencyFinding } from '../../workflow/types.ts';
import { Badge, Button, Card, Collapsible, EmptyState, Input, Notice, Select, Table, Td, TextArea, Th } from '../ui.tsx';
import { EvidenceButton } from './EvidencePanel.tsx';

export function useIndependentQa(review: ReviewRecord): IndependentQaResult {
  const { settings } = useApp();
  return useMemo(() => runIndependentQa(review, settings), [review, settings]);
}

function useWorkflowMutation(review: ReviewRecord) {
  const { persist } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return {
    busy, error,
    async run(fn: () => Promise<{ review: ReviewRecord; audit: AuditEntry[] }> | { review: ReviewRecord; audit: AuditEntry[] }) {
      setBusy(true); setError('');
      try { const res = await fn(); await persist(res.review, res.audit); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    },
    review,
  };
}

// ---------------------------------------------------------------------------
export function ScoreCard({ result }: { result: IndependentQaResult }) {
  const s = result.score;
  const tone = s.score >= 90 ? 'text-emerald-700' : s.score >= 80 ? 'text-amber-700' : 'text-red-700';
  return (
    <Card title="Internal pre-QA score" subtitle={s.disclaimer}>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className={clsx('text-5xl font-bold', tone)}>{s.score.toFixed(1)}<span className="text-xl text-slate-400"> / 100</span></p>
          <p className="text-sm font-medium text-slate-700">{s.band}</p>
          <p className="text-xs text-slate-500">{s.earned} of {s.applicablePoints} applicable points ({s.totalPoints} configured; {s.totalPoints - s.applicablePoints} not applicable)</p>
        </div>
        <div className="grid grid-cols-3 gap-x-5 gap-y-1 text-sm">
          <span>Passed <b>{s.counts.passed}</b></span><span>Needs correction <b>{s.counts.correction}</b></span><span>Needs review <b>{s.counts.needsReview}</b></span>
          <span>Missing <b>{s.counts.missing}</b></span><span>Unable to verify <b>{s.counts.unable}</b></span><span>Not applicable <b>{s.counts.notApplicable}</b></span>
        </div>
        <div className={clsx('ml-auto rounded-lg px-4 py-3 text-sm font-semibold ring-1', s.readiness.ready ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-red-50 text-red-800 ring-red-200')}>
          {s.readiness.ready ? <ShieldCheck className="mb-1" size={18} /> : <AlertOctagon className="mb-1" size={18} />}
          {s.readiness.label}
          {!s.readiness.ready && <ul className="mt-1 list-disc pl-4 text-xs font-normal">{s.readiness.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
        </div>
      </div>
      {(s.critical.length > 0 || s.high.length > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div><p className="text-xs font-semibold uppercase text-red-700">Critical findings ({s.critical.length})</p><ul className="mt-1 list-disc pl-4 text-sm">{s.critical.map((c) => <li key={c}>{c}</li>)}</ul></div>
          <div><p className="text-xs font-semibold uppercase text-amber-700">High-priority findings ({s.high.length})</p><ul className="mt-1 list-disc pl-4 text-sm">{s.high.map((c) => <li key={c}>{c}</li>)}</ul></div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
export function WorkflowTab({ review, goTo }: { review: ReviewRecord; goTo: (tab: string) => void }) {
  const { user } = useApp();
  const qa = useIndependentQa(review);
  const m = useWorkflowMutation(review);
  const [note, setNote] = useState('');
  const wf = review.workflow!;
  const v = latestJournal(review)!;
  const unconfirmed = review.analysis.cds.filter((c) => c.mapped && c.status !== 'Not Documented' && !review.decisions[`cds:${c.fieldId}`]).length;
  const approvedValid = finalApprovalValid(review);
  const steps: { label: string; done: boolean; detail: string; tab?: string }[] = [
    { label: 'Annual journal prepared', done: true, detail: wf.journal.previousReviewId || wf.journal.previousAssessmentDate ? `From previous assessment ${wf.journal.previousAssessmentDate ?? ''} + new changes` : 'New journal', tab: 'journal' },
    { label: 'Case manager approved journal', done: true, detail: `v${v.version} approved by ${v.approvedByName} ${new Date(v.approvedAt).toLocaleString()}`, tab: 'journal' },
    { label: 'CDS prepared automatically', done: true, detail: `${review.analysis.cds.filter((c) => c.mapped && c.status !== 'Not Documented').length} answers from the journal; ${unconfirmed} awaiting confirmation`, tab: 'cds' },
    { label: 'Consistency validation', done: !qa.openFindings.some((f) => f.severity === 'Critical' || f.severity === 'High'), detail: `${qa.openFindings.length} open finding(s)`, tab: 'fix' },
    { label: 'Independent QA audit', done: qa.score.counts.missing === 0 && qa.score.counts.correction === 0, detail: `${qa.score.counts.passed}/17 passed · score ${qa.score.score.toFixed(1)}`, tab: 'score' },
    { label: 'Final approval', done: approvedValid, detail: approvedValid ? `Approved by ${wf.finalApproval!.byName} ${new Date(wf.finalApproval!.at).toLocaleString()}` : wf.finalApproval ? 'Approval no longer valid — documentation changed' : 'Not yet approved' },
  ];
  return (
    <div className="space-y-4">
      <Card title="Annual assessment workflow">
        <ol className="grid gap-3 md:grid-cols-6">
          {steps.map((s, i) => (
            <li key={s.label} className={clsx('rounded-lg border p-3 text-sm', s.done ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50')}>
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">{s.done ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Circle size={15} className="text-amber-600" />} {i + 1}. {s.label}</div>
              <p className="mt-1 text-xs text-slate-600">{s.detail}</p>
              {s.tab && <button className="mt-1 text-xs font-medium text-navy-700 hover:underline" onClick={() => goTo(s.tab!)}>Open</button>}
            </li>
          ))}
        </ol>
      </Card>
      <ScoreCard result={qa} />
      {wf.lastRerun && <RerunImpactCard review={review} />}
      <Card title="Final approval" subtitle="The case manager approves the final journal and CDS preparation. Required before the case can be considered ready for human QA review.">
        {approvedValid ? (
          <Notice tone="green">Approved by {wf.finalApproval!.byName} on {new Date(wf.finalApproval!.at).toLocaleString()} (journal v{wf.finalApproval!.journalVersion}, pre-QA score {wf.finalApproval!.score?.toFixed(1)}). {wf.finalApproval!.note}</Notice>
        ) : (
          <div className="space-y-2">
            {qa.openFindings.length > 0 && <Notice tone="amber">{qa.openFindings.length} finding(s) remain open. You can still approve, but the case will not be marked ready for human QA review while critical findings, missing evidence or contradictions remain.</Notice>}
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Approval note (optional)" />
            <Button variant="primary" disabled={m.busy || !user} onClick={() => m.run(() => approveFinal(review, user!, qa.score.score, note))}>Approve final documentation</Button>
          </div>
        )}
        {m.error && <Notice tone="red" className="mt-2">{m.error}</Notice>}
      </Card>
    </div>
  );
}

function RerunImpactCard({ review }: { review: ReviewRecord }) {
  const r = review.workflow!.lastRerun!;
  return (
    <Card title="Last re-validation" subtitle={`${new Date(r.at).toLocaleString()} — ${r.reason}`}>
      <div className="grid gap-4 text-xs md:grid-cols-3">
        <div><p className="font-semibold uppercase text-slate-500">CDS answers changed ({r.changedCds.length})</p><ul className="mt-1 space-y-0.5">{r.changedCds.slice(0, 12).map((c) => <li key={c.fieldId}><b>{c.label.slice(0, 60)}</b>: <span className="text-slate-500 line-through">{c.before.slice(0, 60)}</span> → {c.after.slice(0, 80)}</li>)}</ul></div>
        <div><p className="font-semibold uppercase text-slate-500">QA results changed ({r.changedQa.length})</p><ul className="mt-1 space-y-0.5">{r.changedQa.map((q) => <li key={q.categoryId}>{q.title}: {q.before} → <b>{q.after}</b></li>)}</ul></div>
        <div><p className="font-semibold uppercase text-slate-500">Decisions needing re-confirmation ({r.invalidatedDecisions.length})</p><ul className="mt-1 space-y-0.5">{r.invalidatedDecisions.map((d) => <li key={d}>{d}</li>)}</ul></div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
export function JournalTab({ review }: { review: ReviewRecord }) {
  const { user, settings } = useApp();
  const analyze = useAnalyzer(review);
  const m = useWorkflowMutation(review);
  const wf = review.workflow!;
  const versions = wf.journal.versions;
  const [selected, setSelected] = useState(versions[versions.length - 1].version);
  const [editing, setEditing] = useState(false);
  const v = versions.find((x) => x.version === selected) ?? versions[versions.length - 1];
  const [text, setText] = useState(v.text);
  const [reason, setReason] = useState('');
  const prev = versions.find((x) => x.version === v.version - 1);
  const prevLines = new Set(prev?.text.split('\n') ?? []);
  const draftState = (line: string) => {
    if (v.version !== 1) return null;
    const df = wf.journal.draftFields.find((f) => line.includes(`${f.label}:`));
    return df?.state ?? null;
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[3fr_1fr]">
      <Card title={`Annual journal — version ${v.version}${v.version === versions[versions.length - 1].version ? ' (current)' : ''}`} subtitle={`${v.reason} · approved by ${v.approvedByName} ${new Date(v.approvedAt).toLocaleString()}`}
        actions={!editing && v.version === versions[versions.length - 1].version && <Button size="sm" onClick={() => { setText(v.text); setEditing(true); }}>Edit journal</Button>}>
        {editing ? (
          <div className="space-y-2">
            <TextArea rows={36} className="font-mono text-[12.5px]" value={text} onChange={(e) => setText(e.target.value)} />
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the change (required)" />
            <div className="flex gap-2">
              <Button variant="primary" disabled={!reason.trim() || m.busy || !user} onClick={async () => { await m.run(() => reviseJournal(review, text, reason.trim(), user!, analyze)); setEditing(false); setReason(''); }}>
                {m.busy ? <Loader2 size={14} className="animate-spin" /> : null} Approve as new version & re-run CDS and QA
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-mono text-[12.5px] leading-relaxed text-slate-800">
            {v.text.split('\n').map((line, i) => {
              const st = draftState(line);
              const changed = prev ? !prevLines.has(line) && line.trim() !== '' : st === 'changed' || st === 'new';
              return (
                <div key={i} className={clsx(changed && 'bg-navy-100/70', st === 'carried-flagged' && 'bg-amber-100/60', /\[\[CLARIFY/.test(line) && 'bg-red-100')}>{line || ' '}</div>
              );
            })}
          </pre>
        )}
        <p className="mt-2 text-xs text-slate-500">Highlights: <span className="bg-navy-100 px-1">changed {prev ? `since v${prev.version}` : 'from the previous assessment'}</span> <span className="bg-amber-100 px-1">carried forward – check</span></p>
        {m.error && <Notice tone="red" className="mt-2">{m.error}</Notice>}
      </Card>
      <div className="space-y-4">
        <Card title="Versions">
          <ul className="space-y-1.5 text-xs">
            {[...versions].reverse().map((x) => (
              <li key={x.version}>
                <button className={clsx('w-full rounded p-1.5 text-left', x.version === selected ? 'bg-navy-50 ring-1 ring-navy-200' : 'hover:bg-slate-50')} onClick={() => { setSelected(x.version); setEditing(false); }}>
                  <b>v{x.version}</b> — {x.reason}<br /><span className="text-slate-500">{x.approvedByName}, {new Date(x.approvedAt).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {v.version === 1 && (
          <Card title="Changes from the previous assessment">
            <ul className="space-y-1 text-xs">
              {wf.journal.draftFields.filter((f) => f.changes.length || f.warnings.length).map((f) => (
                <li key={f.fieldId}><b>{f.label}</b>{f.changes.map((c) => <div key={c} className="text-navy-800">• {c}</div>)}{f.warnings.map((w) => <div key={w} className="text-amber-800">⚠ {w}</div>)}</li>
              ))}
            </ul>
          </Card>
        )}
        <p className="text-xs text-slate-500">Template: {settings.journalTemplate.name} v{settings.journalTemplate.version}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const SEV_TONE = { Critical: 'red', High: 'amber', Medium: 'blue', Low: 'slate' } as const;

export function FixIssuesTab({ review }: { review: ReviewRecord }) {
  const { user, settings } = useApp();
  const analyze = useAnalyzer(review);
  const qa = useIndependentQa(review);
  const m = useWorkflowMutation(review);
  const [view, setView] = useState<'open' | 'all' | 'closed'>('open');
  const states = review.workflow!.findingStates;
  const list = view === 'open' ? qa.openFindings : view === 'closed' ? [] : qa.findings;
  const act = (f: ConsistencyFinding, action: FindingAction) => user && m.run(() => applyFindingAction(review, f, action, user, analyze, settings.journalTemplate));
  const ready = review.analysis.cds.filter((c) => c.mapped && c.status === 'Ready for Review' && !review.decisions[`cds:${c.fieldId}`]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={view} onChange={(e) => setView(e.target.value as typeof view)} className="!w-auto">
          <option value="open">Open findings ({qa.openFindings.length})</option>
          <option value="all">All current findings ({qa.findings.length})</option>
          <option value="closed">Corrections made ({qa.closedFindings.length})</option>
        </Select>
        <Button disabled={m.busy || !user} onClick={() => user && m.run(() => rerunValidation(review, user, analyze))}><RefreshCw size={14} className={m.busy ? 'animate-spin' : ''} /> Re-run validation</Button>
        <Button disabled={m.busy || !ready.length || !user} onClick={() => user && m.run(() => {
          let r = review; const entries: AuditEntry[] = [];
          for (const c of ready) { const res = applyDecision(user, r, 'cds', c.fieldId, { status: 'approved', value: c.suggestedResponse, originalValue: c.suggestedResponse, note: 'Confirmed in bulk (Ready for Review, single supported answer)' }); r = res.review; entries.push(...res.audit); }
          return { review: r, audit: entries };
        })}>Confirm {ready.length} “Ready for Review” CDS answer(s)</Button>
        {m.busy && <span className="flex items-center gap-1 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> Updating journal, CDS and QA…</span>}
      </div>
      <Notice tone="blue">Nothing is changed until you choose an action. Changing the journal creates a new approved version, re-prepares the CDS, re-runs every check, and shows which CDS answers and QA results were affected.</Notice>
      {m.error && <Notice tone="red">{m.error}</Notice>}
      {view === 'closed' ? (
        qa.closedFindings.length ? (
          <Table>
            <thead><tr><Th>Finding</Th><Th>Resolution</Th><Th>By</Th><Th>History</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {qa.closedFindings.map(({ finding, state }) => (
                <tr key={finding.id}>
                  <Td className="font-medium">{finding.title}</Td>
                  <Td><Badge>{state.status === 'rejected' ? 'rejected' : state.status === 'unable_to_verify' ? 'pending' : 'approved'}</Badge> {state.status.replace(/_/g, ' ')}{state.value && <div className="text-xs text-slate-600">{state.value}</div>}{state.note && <div className="text-xs text-slate-500">{state.note}</div>}</Td>
                  <Td className="text-xs">{state.byName}<br />{new Date(state.at).toLocaleString()}</Td>
                  <Td className="text-xs">{state.history.length} action(s)</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="No corrections recorded yet" />
      ) : !list.length ? <EmptyState title="No open findings">Re-run validation after any change. Check the QA Score tab for remaining verification items.</EmptyState> : (
        (['Critical', 'High', 'Medium', 'Low'] as const).map((sev) => {
          const items = list.filter((f) => f.severity === sev);
          if (!items.length) return null;
          return (
            <div key={sev} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Badge tone={SEV_TONE[sev]}>{sev}</Badge> {items.length} finding(s)</h3>
              {items.map((f) => <div key={f.id} id={`finding-${f.id}`} className="scroll-mt-4"><FindingCard finding={f} review={review} open={isOpen(f, states)} busy={m.busy} onAct={(a) => act(f, a)} /></div>)}
            </div>
          );
        })
      )}
    </div>
  );
}

function FindingCard({ finding: f, review, open, busy, onAct }: { finding: ConsistencyFinding; review: ReviewRecord; open: boolean; busy: boolean; onAct: (a: FindingAction) => void }) {
  const { settings } = useApp();
  const field = settings.journalTemplate.fields.find((x) => x.id === f.journalFieldId);
  const current = field ? readJournalField(latestJournal(review)!.text, field) ?? '' : '';
  const [mode, setMode] = useState<'none' | 'info' | 'answer' | 'attest' | 'reject' | 'unable'>('none');
  const [text, setText] = useState('');
  const cds = f.cdsFieldIds.length === 1 ? review.analysis.cds.find((c) => c.fieldId === f.cdsFieldIds[0]) : undefined;
  const state = review.workflow!.findingStates[f.id];
  return (
    <Card title={f.title} subtitle={`${f.category}${f.journalSection ? ` · Journal: ${f.journalSection}` : ''}`}
      actions={<>{f.requiresClarification && <Badge tone="purple">Needs case manager clarification</Badge>}{!open && <Badge tone="slate">closed</Badge>}<EvidenceButton title={f.title} evidence={f.evidence} /></>}>
      <dl className="grid gap-3 text-sm md:grid-cols-2">
        <div><dt className="text-xs font-semibold uppercase text-slate-500">Journal information</dt><dd className="text-slate-800">{f.journalInfo || '—'}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-slate-500">CDS answer</dt><dd className="text-slate-800">{f.cdsAnswer || '—'}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-slate-500">Exact mismatch</dt><dd className="text-red-800">{f.mismatch}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-slate-500">Why it is an issue</dt><dd className="text-slate-700">{f.whyItMatters}</dd></div>
        <div className="md:col-span-2"><dt className="text-xs font-semibold uppercase text-slate-500">Suggested correction</dt><dd className="text-slate-700">{f.suggestedCorrection}</dd></div>
      </dl>
      {(f.cdsFieldIds.length > 0 || f.qaCategoryIds.length > 0) && (
        <p className="mt-2 text-xs text-slate-500">Affects: {[...f.cdsFieldIds.slice(0, 6).map((x) => `CDS ${x}`), ...f.qaCategoryIds.map((x) => `QA ${x}`)].join(', ')}{f.cdsFieldIds.length > 6 ? ` +${f.cdsFieldIds.length - 6} more` : ''}</p>
      )}
      {state && <p className="mt-1 text-xs text-slate-500">Last action: {state.status.replace(/_/g, ' ')} by {state.byName} {new Date(state.at).toLocaleString()}{state.status !== 'rejected' && state.status !== 'unable_to_verify' && open ? ' — the finding is still produced, so it remains open.' : ''}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
        {f.options.map((o) => <Button key={o.id} size="sm" variant="primary" disabled={busy} onClick={() => onAct({ type: 'accept_option', optionId: o.id })}>{o.cdsAnswer ? `Select: ${o.label.slice(0, 70)}` : `Accept: ${o.label.slice(0, 90)}`}</Button>)}
        {field && <Button size="sm" disabled={busy} onClick={() => { setText(current); setMode('info'); }}>Provide / edit journal information</Button>}
        {cds && cds.choices.length > 0 && <Button size="sm" disabled={busy} onClick={() => { setText(''); setMode('answer'); }}>Edit CDS answer</Button>}
        {f.kind === 'record_verification' && <Button size="sm" variant="success" disabled={busy} onClick={() => { setText(''); setMode('attest'); }}>Mark record verified</Button>}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setText(''); setMode('unable'); }}>Unable to verify</Button>
        <Button size="sm" variant="ghost" className="text-red-700" disabled={busy} onClick={() => { setText(''); setMode('reject'); }}>Reject finding</Button>
      </div>
      {mode !== 'none' && (
        <div className="mt-2 space-y-1.5 rounded-md bg-slate-50 p-2">
          {mode === 'info' && field && <p className="text-xs text-slate-600">{field.prefix}{field.label}: — the journal line is replaced with your text and saved as a new approved version.</p>}
          {mode === 'answer' && cds ? (
            <Select value={text} onChange={(e) => setText(e.target.value)}><option value="">Choose the verified answer…</option>{cds.choices.map((c) => <option key={c}>{c}</option>)}</Select>
          ) : (
            <TextArea rows={mode === 'info' ? 3 : 2} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={mode === 'attest' ? 'What did you verify, where and when? (e.g. "Financial Worksheet verified in WellSky 11/13/2026")' : mode === 'info' ? 'Journal text for this field' : 'Reason (required)'} />
          )}
          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" disabled={!text.trim() || busy} onClick={() => {
              if (mode === 'info' && field) onAct({ type: 'provide_info', fieldId: field.id, content: text });
              if (mode === 'answer' && cds) onAct({ type: 'edit_answer', fieldId: cds.fieldId, value: text });
              if (mode === 'attest') onAct({ type: 'attest', text });
              if (mode === 'reject') onAct({ type: 'reject', note: text });
              if (mode === 'unable') onAct({ type: 'unable', note: text });
              setMode('none');
            }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('none')}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
export function QaScoreTab({ review }: { review: ReviewRecord }) {
  const qa = useIndependentQa(review);
  return (
    <div className="space-y-4">
      <ScoreCard result={qa} />
      <Notice tone="blue" title="Independent QA reviewer">{qa.method}</Notice>
      <Card title="Scoring breakdown">
        <Table>
          <thead><tr><Th>#</Th><Th>Category</Th><Th>Result</Th><Th>Points</Th><Th>Factor</Th><Th>Earned</Th><Th>Basis</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {qa.score.categories.map((c) => (
              <tr key={c.categoryId} className={!c.applicable ? 'text-slate-400' : undefined}>
                <Td>{c.number}</Td><Td className="font-medium">{c.title}{c.attested && <Badge tone="purple" className="ml-1">attested</Badge>}</Td>
                <Td><Badge>{c.status}</Badge></Td><Td>{c.points}</Td><Td>{c.applicable ? c.factor : 'excluded'}</Td><Td className="font-semibold">{c.applicable ? c.earned : '—'}</Td>
                <Td className="text-xs">{c.basis}</Td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold"><Td /><Td>Total</Td><Td /><Td>{qa.score.applicablePoints} applicable</Td><Td /><Td>{qa.score.earned}</Td><Td>Normalized: {qa.score.earned} ÷ {qa.score.applicablePoints} × 100 = {qa.score.score.toFixed(1)}</Td></tr>
          </tbody>
        </Table>
      </Card>
      <Card title="Independent QA results (17 categories)">
        <div className="space-y-2">
          {qa.qa.map((q) => (
            <Collapsible key={q.categoryId} summary={<span className="flex items-center gap-2">{q.number}. {q.title} <Badge>{q.status}</Badge></span>}>
              <div className="grid gap-3 text-xs md:grid-cols-3">
                <div><p className="font-semibold uppercase text-slate-500">Evidence found</p>{q.evidenceFound.length ? q.evidenceFound.slice(0, 5).map((e, i) => <p key={i}>“{e.text}”</p>) : <p className="text-slate-400">None</p>}</div>
                <div><p className="font-semibold uppercase text-slate-500">Missing / not accessible</p>{q.evidenceMissing.length ? q.evidenceMissing.map((e) => <p key={e} className="text-red-800">• {e}</p>) : <p className="text-slate-400">None</p>}</div>
                <div><p className="font-semibold uppercase text-slate-500">Recommended correction</p><p>{q.recommendedCorrection}</p>{q.notes && <p className="mt-1 text-slate-500">{q.notes}</p>}</div>
              </div>
            </Collapsible>
          ))}
        </div>
      </Card>
      {qa.score.recommended.length > 0 && (
        <Card title="Recommended corrections"><ul className="list-disc space-y-1 pl-5 text-sm">{qa.score.recommended.map((r) => <li key={r}>{r}</li>)}</ul></Card>
      )}
    </div>
  );
}

