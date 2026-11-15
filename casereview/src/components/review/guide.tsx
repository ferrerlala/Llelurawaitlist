// One connected case workflow:
//   Assessment → Journal → CDS → Corrections → QA → Final Report
// Each step says what the system generated, what needs the case manager, and what to do next.
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, CheckCircle2, Pencil } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useApp } from '../../app/AppContext.tsx';
import { useAnalyzer } from '../../app/use-analyzer.ts';
import { applyDecision } from '../../data/review-actions.ts';
import type { ReviewRecord } from '../../data/types.ts';
import { cdsRows, confirmedCdsText, groupBySection, notInJournalCount, type EvidenceStatus } from '../../workflow/cds-view.ts';
import { approveFinal, cdsJournalGaps, finalApprovalValid, latestJournal, matchCdsToJournal, reviseJournal } from '../../workflow/engine.ts';
import { Badge, Notice, TextArea } from '../ui.tsx';
import { AssistantPanel } from './assistant-panel.tsx';
import { CopyButton, cleanText, journalSections } from './copy.tsx';
import { CaseProgress, type CaseStep } from './progress.tsx';
import { useBaselineScore } from './results-tab.tsx';
import { FixIssuesTab, issueCategory, useIndependentQa } from './workflow-tabs.tsx';

const NEXT: Record<CaseStep, CaseStep | null> = { assessment: 'journal', journal: 'cds', cds: 'corrections', corrections: 'qa', qa: 'final', final: null };
const STEP_TITLE: Record<CaseStep, string> = { assessment: 'Assessment', journal: 'Annual Journal', cds: 'CDS Preparation', corrections: 'Corrections', qa: 'QA Review', final: 'Final Report' };

export function GuideView({ review, onAdvanced, initialStep }: { review: ReviewRecord; onAdvanced: () => void; initialStep?: CaseStep }) {
  const qa = useIndependentQa(review);
  const [step, setStepRaw] = useState<CaseStep>(initialStep ?? 'journal');
  const [done, setDone] = useState('');
  const setStep = (s: CaseStep) => { setStepRaw(s); setDone(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const rows = cdsRows(review);
  const cdsOpen = rows.filter((r) => r.status !== 'Confirmed' && r.status !== 'Not Applicable' && r.status !== 'Missing').length;
  const complete: Partial<Record<CaseStep, boolean>> = {
    assessment: true,
    journal: !!latestJournal(review),
    cds: cdsOpen === 0 && cdsJournalGaps(review).total === 0,
    corrections: qa.openFindings.length === 0,
    qa: qa.score.readiness.ready,
    final: qa.score.readiness.ready,
  };

  return (
    <div className="space-y-5">
      <CaseProgress active={step} complete={complete} onSelect={setStep} />
      {done && (
        <div className="flex flex-wrap items-center gap-3 border border-emerald-600 bg-emerald-50 px-5 py-3 text-emerald-900" role="status">
          <CheckCircle2 size={18} /> <span className="flex-1">{done}</span>
          <button type="button" className="text-xs underline" onClick={() => setDone('')}>Dismiss</button>
        </div>
      )}
      {step === 'assessment' && <AssessmentStep review={review} />}
      {step === 'journal' && <JournalStep review={review} onDone={setDone} />}
      {step === 'cds' && <CdsStep review={review} onDone={setDone} goCorrections={() => setStep('corrections')} />}
      {step === 'corrections' && <CorrectionsStep review={review} onDone={setDone} />}
      {step === 'qa' && <QaStep review={review} onDone={setDone} goCorrections={() => setStep('corrections')} />}
      {step === 'final' && <FinalStep review={review} />}
      {NEXT[step] && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setStep(NEXT[step]!)} className="inline-flex items-center gap-2 bg-slate-900 px-6 py-3.5 text-base font-medium text-white hover:bg-slate-700">
            Next: {STEP_TITLE[NEXT[step]!]} <ArrowRight size={18} />
          </button>
        </div>
      )}
      <p className="pt-2 text-center"><button type="button" onClick={onAdvanced} className="text-xs text-slate-500 underline">More tools: ADL/IADL comparison, follow-up tasks, history, audit log</button></p>
    </div>
  );
}

function StepHeader({ n, title, text, actions }: { n: number; title: string; text: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase text-slate-500">Step {n} of 6</p>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-1 max-w-3xl text-base text-slate-700">{text}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

function Panel({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('border border-slate-200 bg-white', className)}>
      {(title || right) && <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3"><h3 className="min-w-0 flex-1 text-lg font-semibold">{title}</h3>{right}</div>}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- 1. Assessment
function AssessmentStep({ review }: { review: ReviewRecord }) {
  const wf = review.workflow!;
  const fields = wf.journal.draftFields;
  const changed = fields.filter((f) => f.state === 'changed' || f.state === 'new');
  const confirmed = fields.filter((f) => f.state === 'confirmed');
  const check = fields.filter((f) => f.state === 'carried-flagged' || f.state === 'clarify');
  const supporting = review.input.documents.filter((d) => d.id !== 'annual-journal');
  return (
    <div className="space-y-4">
      <StepHeader n={1} title="Assessment" text="The case details and what you confirmed when you started. This step is done." />
      <Panel title="Case details">
        <dl className="grid gap-4 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[['Internal case ID', review.input.caseIdentifier], ['Assessment type', review.input.assessmentType], ['Assessment date', review.input.assessmentDate || 'Not entered'], ['Program', review.input.program || 'Not entered'],
            ['Previous assessment', wf.journal.previousAssessmentDate || 'None found'], ['Supporting documents', String(supporting.length)]].map(([k, v]) => (
            <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>
          ))}
        </dl>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={<>Changed or new <span className="text-sm font-normal text-slate-500">· {changed.length}</span></>}>
          <ul className="divide-y divide-slate-100 text-sm">{changed.length ? changed.map((f) => <li key={f.fieldId} className="px-4 py-2"><b>{f.label}</b>{f.changes[0] && <span className="block text-slate-600">{f.changes[0]}</span>}</li>) : <li className="px-4 py-3 text-slate-500">None</li>}</ul>
        </Panel>
        <Panel title={<>Unchanged — you confirmed <span className="text-sm font-normal text-slate-500">· {confirmed.length}</span></>}>
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">{confirmed.length ? confirmed.map((f) => <li key={f.fieldId} className="px-4 py-2">{f.label}</li>) : <li className="px-4 py-3 text-slate-500">None</li>}</ul>
        </Panel>
        <Panel title={<>Needed checking <span className="text-sm font-normal text-slate-500">· {check.length}</span></>}>
          <ul className="divide-y divide-slate-100 text-sm">{check.length ? check.map((f) => <li key={f.fieldId} className="px-4 py-2"><b>{f.label}</b>{f.warnings[0] && <span className="block text-amber-800">{f.warnings[0]}</span>}</li>) : <li className="px-4 py-3 text-slate-500">None</li>}</ul>
        </Panel>
      </div>
      {supporting.length > 0 && (
        <Panel title="Supporting documents">
          <ul className="divide-y divide-slate-100 text-sm">{supporting.map((d) => <li key={d.id} className="flex flex-wrap gap-2 px-4 py-2"><b>{d.name}</b><span className="text-slate-500">{d.type}</span></li>)}</ul>
        </Panel>
      )}
      <p className="text-sm text-slate-600">Old information was carried forward only where you confirmed it was still accurate.</p>
    </div>
  );
}

// ---------------------------------------------------------------- 2. Journal
function JournalStep({ review, onDone }: { review: ReviewRecord; onDone: (m: string) => void }) {
  const { user, persist } = useApp();
  const analyze = useAnalyzer(review);
  const v = latestJournal(review)!;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(v.text);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sections = journalSections(v.text);
  const highlights = review.workflow!.journal.draftFields.filter((f) => (f.state === 'changed' || f.state === 'new') && f.content);
  const isNew = (body: string) => highlights.some((f) => f.content && cleanText(body).includes(cleanText(f.content).slice(0, 40)));

  const save = async () => {
    if (!user) return;
    setBusy(true); setError('');
    try {
      const res = await reviseJournal(review, text, reason.trim() || 'Edited by the case manager', user, analyze);
      await persist(res.review, res.audit);
      setEditing(false); setReason('');
      onDone(`Journal version ${v.version + 1} saved and approved. The CDS answers and checks were updated from it.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <StepHeader n={2} title="Annual Journal" text={<>Your approved journal in the agency format. Sections with new information are marked <span className="bg-navy-50 px-1 text-navy-800">New</span>. Edit it here, or copy it into WellSky.</>}
        actions={!editing && <><button type="button" onClick={() => { setText(v.text); setEditing(true); }} className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50"><Pencil size={14} /> Edit journal</button><CopyButton text={v.text} label="Copy journal" big /></>} />
      <p className="text-sm text-slate-600">Version {v.version} · approved by {v.approvedByName} on {new Date(v.approvedAt).toLocaleString()}</p>
      {editing ? (
        <Panel title="Edit journal">
          <div className="space-y-3 p-4">
            <TextArea rows={28} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-[13px] leading-relaxed" aria-label="Journal text" />
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What did you change? (optional)" className="w-full border border-slate-300 px-3 py-2 text-sm" aria-label="Reason for the change" />
            <p className="text-sm text-slate-600">Saving creates a new approved version. The CDS answers and all checks are updated from it. Earlier versions are kept.</p>
            {error && <Notice tone="red">{error}</Notice>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || text === v.text} onClick={save} className="bg-navy-700 px-5 py-3 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-40">{busy ? 'Saving…' : 'Save and approve'}</button>
              <button type="button" onClick={() => setEditing(false)} className="border border-slate-300 bg-white px-5 py-3 text-sm">Cancel</button>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel>
          <div className="divide-y divide-slate-100">
            {sections.map((s, i) => (
              <div key={i} className={clsx('flex flex-wrap items-start gap-3 px-4 py-3', isNew(s.body) && 'bg-navy-50/50')}>
                <pre className="min-w-0 flex-1 basis-64 whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-slate-900">{s.body}</pre>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {isNew(s.body) && <span className="bg-navy-50 px-1.5 py-0.5 text-[11px] font-medium text-navy-800">New</span>}
                  <CopyButton text={s.body} label="Copy section" />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 3. CDS
const STATUS_STYLE: Record<EvidenceStatus, string> = {
  Confirmed: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  Suggested: 'bg-navy-50 text-navy-800 ring-navy-200',
  'Needs Clarification': 'bg-amber-50 text-amber-900 ring-amber-300',
  Contradictory: 'bg-red-50 text-red-800 ring-red-200',
  'Unable to Verify': 'bg-slate-100 text-slate-700 ring-slate-300',
  Missing: 'bg-amber-50 text-amber-900 ring-amber-200',
  'Not Applicable': 'bg-slate-50 text-slate-500 ring-slate-200',
};

function StatusPill({ s }: { s: EvidenceStatus }) {
  return <span className={clsx('inline-block whitespace-nowrap px-2 py-0.5 text-xs font-medium ring-1 ring-inset', STATUS_STYLE[s])}>{s}</span>;
}

function CdsStep({ review, onDone, goCorrections }: { review: ReviewRecord; onDone: (m: string) => void; goCorrections: () => void }) {
  const { user, persist } = useApp();
  const [busy, setBusy] = useState(false);
  const rows = cdsRows(review);
  const groups = groupBySection(rows);
  const gaps = cdsJournalGaps(review);
  const count = (s: EvidenceStatus) => rows.filter((r) => r.status === s).length;
  const confirmOne = async (fieldId: string, value: string) => {
    if (!user) return;
    const res = applyDecision(user, review, 'cds', fieldId, { status: 'approved', value, originalValue: value, note: 'Confirmed on the CDS step' });
    await persist(res.review, res.audit);
  };
  const confirmAll = async () => {
    if (!user) return;
    setBusy(true);
    try { const m = matchCdsToJournal(review, user); await persist(m.review, m.audit); onDone(`${m.summary.confirmed} answer(s) confirmed${m.summary.updated ? ` and ${m.summary.updated} updated to match the journal` : ''}.`); }
    finally { setBusy(false); }
  };
  const allConfirmed = confirmedCdsText(review);
  return (
    <div className="space-y-4">
      <StepHeader n={3} title="CDS Preparation" text="The CDS-3-CM answers prepared from your approved journal. Nothing is entered in WellSky by this app — you copy the confirmed answers yourself."
        actions={<CopyButton text={allConfirmed} label="Copy all confirmed CDS answers" big />} />
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {(['Confirmed', 'Suggested', 'Needs Clarification', 'Contradictory', 'Unable to Verify', 'Missing'] as EvidenceStatus[]).map((s) => <span key={s} className="flex items-center gap-1.5"><StatusPill s={s} /> {count(s)}</span>)}
      </div>
      {gaps.total > 0 && (
        <div className="flex flex-wrap items-center gap-3 border border-navy-300 bg-white p-4">
          <p className="min-w-0 flex-1 basis-64 text-sm"><b>{gaps.unconfirmed.length} suggested answer(s)</b> come straight from the journal{gaps.differs.length ? `, and ${gaps.differs.length} confirmed answer(s) no longer match it` : ''}. Review them below, or confirm them all at once.</p>
          <button type="button" disabled={busy || !user} onClick={confirmAll} className="bg-navy-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-40">Confirm all answers from the journal</button>
        </div>
      )}
      {(count('Needs Clarification') + count('Contradictory') > 0) && (
        <Notice tone="amber">{count('Needs Clarification') + count('Contradictory')} answer(s) can't be taken from the journal as written. <button type="button" className="underline" onClick={goCorrections}>Fix them in Corrections</button>.</Notice>
      )}
      {groups.map((g) => (
        <Panel key={g.name} title={<span className="text-base">{g.name}</span>} right={<CopyButton text={confirmedCdsText(review, g.name)} label="Copy section" />}>
          <div className="hidden grid-cols-[1.4fr_1.2fr_1.2fr_auto] gap-3 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 md:grid"><span>CDS field</span><span>Answer</span><span>From the journal</span><span>Status</span></div>
          <div className="divide-y divide-slate-100">
            {g.rows.map((r) => (
              <div key={r.c.fieldId} className="grid gap-1.5 px-4 py-3 md:grid-cols-[1.4fr_1.2fr_1.2fr_auto] md:gap-3">
                <p className="text-sm"><span className="text-slate-500">{r.c.code} </span>{r.c.label}</p>
                <p className="text-sm font-medium">{r.answer || <span className="font-normal text-slate-400">—</span>}</p>
                <p className="text-xs text-slate-600">{r.evidence ? `“${r.evidence.slice(0, 140)}${r.evidence.length > 140 ? '…' : ''}”` : '—'}</p>
                <div className="flex flex-wrap items-start gap-1.5 md:flex-col md:items-end">
                  <StatusPill s={r.status} />
                  {r.status === 'Suggested' && r.answer && <button type="button" onClick={() => confirmOne(r.c.fieldId, r.answer)} className="text-xs font-medium text-navy-700 underline">Confirm</button>}
                  {(r.status === 'Needs Clarification' || r.status === 'Contradictory' || r.status === 'Unable to Verify') && <button type="button" onClick={goCorrections} className="text-xs font-medium text-navy-700 underline">Resolve</button>}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ))}
      <p className="text-sm text-slate-600">{notInJournalCount(review)} other CDS question(s) are not covered by the journal. Complete them in WellSky from your assessment. Never enter "No" just because something is not written down.</p>
    </div>
  );
}

// ---------------------------------------------------------------- 4. Corrections
function CorrectionsStep({ review, onDone }: { review: ReviewRecord; onDone: (m: string) => void }) {
  const qa = useIndependentQa(review);
  const byCat = (c: string) => qa.openFindings.filter((f) => issueCategory(f) === c).length;
  const complete = qa.qa.filter((q) => q.status === 'Complete').length;
  const na = qa.qa.filter((q) => q.status === 'Not Applicable').length;
  return (
    <div className="space-y-4">
      <StepHeader n={4} title="Corrections" text="The journal and CDS were compared. Approve the suggested fixes, or resolve each issue yourself. Every change re-runs the checks." />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[['Critical', byCat('Critical'), 'text-red-700'], ['Needs Correction', byCat('Needs Correction'), 'text-amber-700'], ['Missing', byCat('Missing'), 'text-navy-700'],
          ['Needs Verification', byCat('Needs Verification'), 'text-slate-700'], ['Complete (QA items)', complete, 'text-emerald-700'], ['Not Applicable', na, 'text-slate-500']].map(([label, n, cls]) => (
          <div key={label as string} className="border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className={clsx('text-2xl font-semibold', cls as string)}>{n}</p></div>
        ))}
      </div>
      <AssistantPanel review={review} embedded onDone={(m) => { onDone(m); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      {qa.openFindings.length > 0 && (
        <details className="border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-lg font-semibold">Or resolve issues one by one ({qa.openFindings.length})</summary>
          <div className="border-t border-slate-200 p-4"><FixIssuesTab review={review} /></div>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 5. QA
const RESULT_LABEL: Record<string, string> = { Complete: 'Complete', Mismatch: 'Needs Correction', Missing: 'Missing', 'Needs Review': 'Needs Correction', 'Unable to Verify': 'Unable to Verify', 'Not Applicable': 'Not Applicable' };

function QaStep({ review, onDone, goCorrections }: { review: ReviewRecord; onDone: (m: string) => void; goCorrections: () => void }) {
  const { user, persist } = useApp();
  const qa = useIndependentQa(review);
  const baseline = useBaselineScore(review);
  const s = qa.score;
  const approved = finalApprovalValid(review);
  const onlyApprovalLeft = !s.readiness.ready && !approved && qa.openFindings.length === 0;
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    if (!user) return;
    setBusy(true);
    try { const r = approveFinal(review, user, s.score, 'Final documentation approved'); await persist(r.review, r.audit); onDone('You approved the final documentation.'); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <StepHeader n={5} title="QA Review" text="An independent re-read of the final journal and CDS against the 17-item AgeSpan QA checklist." />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 bg-slate-900 p-6 text-white">
          <span className="text-xs uppercase text-navy-200">Internal pre-QA estimate</span>
          <div className="flex flex-wrap items-end gap-4">
            <p className="text-6xl font-semibold leading-none">{s.score.toFixed(1)}<span className="text-xl text-navy-200"> / 100</span></p>
            {baseline !== null && Math.abs(baseline - s.score) >= 0.05 && <p className="pb-1 text-sm text-navy-200">started at {baseline.toFixed(1)}</p>}
          </div>
          <div className="h-2 bg-slate-700"><div className="h-2 bg-navy-300" style={{ width: `${Math.max(0, Math.min(100, s.score))}%` }} /></div>
          <p className="text-sm text-navy-100">{s.earned} of {s.applicablePoints} points available ({s.totalPoints - s.applicablePoints} points not applicable)</p>
          <p className="text-xs text-navy-200">Not an official AgeSpan QA score. It does not guarantee a QA pass.</p>
        </section>
        <section className={clsx('flex flex-col justify-center gap-2 border p-6', s.readiness.ready ? 'border-emerald-600 bg-emerald-50' : 'border-red-300 bg-white')}>
          <p className={clsx('text-2xl font-semibold', s.readiness.ready ? 'text-emerald-800' : 'text-red-800')}>{s.readiness.label}</p>
          {onlyApprovalLeft ? (
            <>
              <p className="text-sm text-slate-700">Everything is fixed. Your approval of the final documentation is the last step.</p>
              <button type="button" disabled={busy || !user} onClick={approve} className="self-start bg-emerald-700 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40">Approve final documentation</button>
            </>
          ) : !s.readiness.ready && (
            <>
              <ul className="list-disc pl-5 text-sm text-slate-700">{s.readiness.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              <button type="button" onClick={goCorrections} className="self-start border border-slate-900 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Go to Corrections</button>
            </>
          )}
        </section>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[['Complete', s.counts.passed], ['Needs Correction', s.counts.correction + s.counts.needsReview], ['Missing', s.counts.missing], ['Unable to Verify', s.counts.unable], ['Not Applicable', s.counts.notApplicable], ['Critical findings', s.critical.length]].map(([k, n]) => (
          <div key={k as string} className="border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{k}</p><p className="text-2xl font-semibold">{n}</p></div>
        ))}
      </div>
      {s.critical.length > 0 && <Notice tone="red" title="Critical findings">{s.critical.join(' · ')}</Notice>}
      <Panel title="Score breakdown — the reason for every score">
        <div className="hidden grid-cols-[2rem_1.4fr_9rem_6rem_2fr] gap-3 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 md:grid"><span>#</span><span>Requirement</span><span>Result</span><span>Points</span><span>Reason</span></div>
        <div className="divide-y divide-slate-100">
          {s.categories.map((c) => (
            <div key={c.categoryId} className={clsx('grid gap-1 px-4 py-3 text-sm md:grid-cols-[2rem_1.4fr_9rem_6rem_2fr] md:gap-3', !c.applicable && 'text-slate-400')}>
              <span className="text-slate-500">{c.number}</span>
              <span className="font-medium">{c.title}{c.attested && <Badge tone="purple" className="ml-1">checked by you</Badge>}</span>
              <span><Badge tone={c.status === 'Complete' ? 'green' : c.status === 'Not Applicable' || c.status === 'Unable to Verify' ? 'slate' : c.status === 'Missing' ? 'amber' : 'red'}>{RESULT_LABEL[c.status] ?? c.status}</Badge></span>
              <span>{c.applicable ? `${c.earned} / ${c.points}` : 'n/a'}</span>
              <span className="text-slate-600">{c.basis}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- 6. Final Report
function FinalStep({ review }: { review: ReviewRecord }) {
  const qa = useIndependentQa(review);
  const s = qa.score;
  const journal = latestJournal(review)!.text;
  const sections = journalSections(journal);
  const cds = confirmedCdsText(review);
  const groups = groupBySection(cdsRows(review).filter((r) => r.status === 'Confirmed'));
  const tasks = review.tasks.filter((t) => t.status !== 'Completed');
  const everything = `${cleanText(journal)}\n\n${cds}`;
  return (
    <div className="space-y-4">
      <StepHeader n={6} title="Final Report" text="Everything in one place. Copy the journal and the confirmed CDS answers into WellSky. This app does not enter anything in WellSky."
        actions={<CopyButton text={everything} label="Copy journal + CDS" big />} />
      <section className={clsx('flex flex-wrap items-center gap-4 border p-5', s.readiness.ready ? 'border-emerald-600 bg-emerald-50' : 'border-amber-400 bg-white')}>
        {s.readiness.ready ? <CheckCircle2 className="text-emerald-700" size={28} /> : <AlertTriangle className="text-amber-700" size={28} />}
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold">{s.readiness.label}</p>
          <p className="text-sm text-slate-700">QA estimate {s.score.toFixed(1)} / 100 · {s.earned} of {s.applicablePoints} points · journal version {latestJournal(review)!.version}</p>
        </div>
      </section>

      <Panel title="Approved annual journal" right={<CopyButton text={journal} label="Copy journal" />}>
        <div className="divide-y divide-slate-100">
          {sections.map((sec, i) => (
            <div key={i} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <pre className="min-w-0 flex-1 basis-64 whitespace-pre-wrap font-sans text-[15px] leading-relaxed">{sec.body}</pre>
              <CopyButton text={sec.body} label="Copy section" />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={<>Confirmed CDS preparation answers <span className="text-sm font-normal text-slate-500">· {groups.reduce((n, g) => n + g.rows.length, 0)}</span></>} right={<CopyButton text={cds} label="Copy all CDS" />}>
        {groups.length === 0 ? <p className="px-4 py-3 text-sm text-slate-600">No CDS answers are confirmed yet. Confirm them on the CDS step.</p> : groups.map((g) => (
          <div key={g.name} className="border-b border-slate-100 last:border-0">
            <div className="flex items-center gap-3 bg-slate-50 px-4 py-2"><p className="flex-1 text-sm font-medium">{g.name}</p><CopyButton text={confirmedCdsText(review, g.name)} label="Copy section" /></div>
            <ul className="divide-y divide-slate-100">{g.rows.map((r) => <li key={r.c.fieldId} className="grid gap-1 px-4 py-2 text-sm md:grid-cols-[1.4fr_1fr]"><span className="text-slate-600">{r.c.code} {r.c.label}</span><span className="font-medium">{r.answer}</span></li>)}</ul>
          </div>
        ))}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={<>Outstanding issues <span className="text-sm font-normal text-slate-500">· {qa.openFindings.length}</span></>}>
          {qa.openFindings.length ? (
            <ul className="divide-y divide-slate-100 text-sm">{qa.openFindings.map((f) => <li key={f.id} className="flex flex-wrap items-center gap-2 px-4 py-2"><Badge tone={issueCategory(f) === 'Critical' ? 'red' : 'amber'}>{issueCategory(f)}</Badge> {f.title}</li>)}</ul>
          ) : <p className="px-4 py-3 text-sm text-emerald-800">None.</p>}
        </Panel>
        <Panel title={<>Required follow-up actions <span className="text-sm font-normal text-slate-500">· {tasks.length}</span></>}>
          {tasks.length ? (
            <ul className="divide-y divide-slate-100 text-sm">{tasks.map((t) => <li key={t.id} className="px-4 py-2"><b>{t.description}</b><span className="block text-slate-600">{t.responsible} · due {t.dueDate ?? 'not documented'} · {t.status}</span></li>)}</ul>
          ) : <p className="px-4 py-3 text-sm text-slate-600">None.</p>}
        </Panel>
      </div>

      <Panel title="QA breakdown">
        <ul className="grid gap-x-6 sm:grid-cols-2">
          {s.categories.map((c) => (
            <li key={c.categoryId} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2 text-sm">
              <span>{c.number}. {c.title}</span>
              <span className="shrink-0 text-slate-600">{RESULT_LABEL[c.status] ?? c.status} · {c.applicable ? `${c.earned}/${c.points}` : 'n/a'}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
