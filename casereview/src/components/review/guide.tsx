// One connected Journal-to-CDs workflow. The approved journal is the source of truth.
//   Journal Review → CDs Completion Report → Final QA Validation
// Colors: green = verified/matched · yellow = needs CM review · red = missing/discrepancy · blue = AI correction.
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, CheckCircle2, Lock, Pencil, Sparkles } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../../app/AppContext.tsx';
import { useAnalyzer } from '../../app/use-analyzer.ts';
import { journalTemplateFor, type JournalTemplate } from '../../config/journal-template.ts';
import { applyDecision } from '../../data/review-actions.ts';
import type { ReviewRecord } from '../../data/types.ts';
import { cdsRows, confirmedCdsText, groupBySection, type CdsRow } from '../../workflow/cds-view.ts';
import { approveFinal, cdsJournalGaps, finalApprovalValid, journalLocked, latestJournal, lockJournal, matchCdsToJournal, recordAiCorrections, reviseJournal } from '../../workflow/engine.ts';
import { fieldForLine, setJournalField } from '../../workflow/journal-builder.ts';
import { lintJournal, type LintIssue } from '../../workflow/journal-lint.ts';
import { validationScores, type ValidationScores } from '../../workflow/scores.ts';
import { Badge, Notice, TextArea } from '../ui.tsx';
import { AssistantPanel } from './assistant-panel.tsx';
import { CopyButton, cleanText } from './copy.tsx';
import { CaseProgress, type CaseStep } from './progress.tsx';
import { useBaselineScore } from './results-tab.tsx';
import { issueCategory, useIndependentQa } from './workflow-tabs.tsx';

type Section = 'journal' | 'cds' | 'qa';
const JOURNAL_KINDS = new Set(['journal_conflict', 'journal_missing', 'classification', 'discrepancy']);

type Tone = 'green' | 'yellow' | 'red' | 'blue';
const TONE: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  yellow: 'bg-amber-50 text-amber-900 ring-amber-300',
  red: 'bg-red-50 text-red-800 ring-red-300',
  blue: 'bg-navy-50 text-navy-800 ring-navy-300',
};
const BAR: Record<Tone, string> = { green: 'border-l-emerald-600', yellow: 'border-l-amber-500', red: 'border-l-red-600', blue: 'border-l-navy-600' };
function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={clsx('inline-block whitespace-nowrap px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONE[tone])}>{children}</span>;
}

function useCaseData(review: ReviewRecord) {
  const { settings } = useApp();
  const qa = useIndependentQa(review);
  const template = journalTemplateFor(settings, review.input.assessmentType);
  const journal = latestJournal(review)!;
  const lint = useMemo(() => lintJournal(journal.text, template), [journal.text, template]);
  const scores = useMemo(() => validationScores(review, template, qa, lint), [review, template, qa, lint]);
  return { qa, template, journal, lint, scores };
}

export function GuideView({ review, onAdvanced, initialStep }: { review: ReviewRecord; onAdvanced: () => void; initialStep?: CaseStep }) {
  const start: Section = initialStep === 'cds' ? 'cds' : initialStep === 'qa' || initialStep === 'final' ? 'qa' : 'journal';
  const [section, setSectionRaw] = useState<Section>(start);
  const [done, setDone] = useState('');
  const setSection = (s: Section) => { setSectionRaw(s); setDone(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const { qa, scores } = useCaseData(review);
  const locked = journalLocked(review);
  const complete: Partial<Record<CaseStep, boolean>> = {
    assessment: true,
    journal: locked,
    cds: locked && scores.cdsReport >= 99.95 && cdsJournalGaps(review).total === 0,
    qa: finalApprovalValid(review) && qa.score.readiness.ready && scores.unresolved === 0,
  };
  return (
    <div className="space-y-5">
      <CaseProgress active={section} complete={complete} onSelect={(s) => s !== 'assessment' && setSection(s as Section)} />
      {done && (
        <div className="flex flex-wrap items-center gap-3 border border-emerald-600 bg-emerald-50 px-5 py-3 text-emerald-900" role="status">
          <CheckCircle2 size={18} /> <span className="min-w-0 flex-1 basis-64">{done}</span>
          <button type="button" className="text-xs underline" onClick={() => setDone('')}>Dismiss</button>
        </div>
      )}
      {section === 'journal' && <JournalReview review={review} onDone={setDone} goCds={() => setSection('cds')} />}
      {section === 'cds' && <CdsReport review={review} onDone={setDone} goJournal={() => setSection('journal')} goQa={() => setSection('qa')} />}
      {section === 'qa' && <FinalQa review={review} onDone={setDone} goJournal={() => setSection('journal')} goCds={() => setSection('cds')} />}
      <p className="pt-2 text-center"><button type="button" onClick={onAdvanced} className="text-xs text-slate-500 underline">More tools: ADL/IADL comparison, follow-up tasks, journal versions, history, audit log</button></p>
    </div>
  );
}

function Header({ n, title, text, right }: { n: number; title: string; text: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 basis-80 flex-1">
        <p className="text-xs font-medium uppercase text-slate-500">Section {n} of 3</p>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-1 max-w-3xl text-base text-slate-700">{text}</p>
      </div>
      {right && <div className="flex flex-wrap gap-2">{right}</div>}
    </div>
  );
}

function Panel({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('border border-slate-200 bg-white', className)}>
      {(title || right) && <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3"><h3 className="min-w-0 flex-1 basis-56 text-lg font-semibold">{title}</h3>{right}</div>}
      {children}
    </section>
  );
}

function ScoreTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <div className={clsx('border border-slate-200 bg-white p-3', tone && `border-l-4 ${BAR[tone]}`)}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
const toneFor = (score: number): Tone => (score >= 99.95 ? 'green' : score >= 80 ? 'yellow' : 'red');
const fmt = (n: number) => `${n.toFixed(n >= 99.95 ? 0 : 1)}%`;

function NextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="flex justify-end">
      <button type="button" onClick={onClick} className="inline-flex items-center gap-2 bg-slate-900 px-6 py-3.5 text-base font-medium text-white hover:bg-slate-700">{label} <ArrowRight size={18} /></button>
    </div>
  );
}

// ======================================================================== 1. Journal Review
function JournalReview({ review, onDone, goCds }: { review: ReviewRecord; onDone: (m: string) => void; goCds: () => void }) {
  const { user, persist } = useApp();
  const analyze = useAnalyzer(review);
  const { qa, template, journal, lint, scores } = useCaseData(review);
  const locked = journalLocked(review);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(journal.text);
  const [rejected, setRejected] = useState<Record<string, boolean>>({});
  const [fill, setFill] = useState<Record<string, string>>({});

  const aiFixes = lint.filter((l) => l.corrected);
  const missing = lint.filter((l) => l.kind === 'Missing');
  const journalFindings = qa.openFindings.filter((f) => JOURNAL_KINDS.has(f.kind));

  const save = async (newText: string, reason: string, aiItems?: { field: string; before: string; after: string }[]) => {
    if (!user) return false;
    setBusy(true); setError('');
    try {
      const res = await reviseJournal(review, newText, reason, user, analyze);
      const r = aiItems?.length ? recordAiCorrections(res.review, user, aiItems) : res.review;
      await persist(r, res.audit);
      return true;
    } catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  };

  const approveAiFixes = async () => {
    const chosen = aiFixes.filter((l) => !rejected[l.id]);
    let out = journal.text;
    for (const l of chosen) out = setJournalField(out, template, l.fieldId, l.corrected!);
    if (await save(out, `Assistant corrections approved (${chosen.length})`, chosen.map((l) => ({ field: l.field, before: l.sentence, after: l.corrected! })))) {
      setRejected({});
      onDone(`${chosen.length} correction(s) approved and saved as journal version ${journal.version + 1}.`);
    }
  };

  const addMissing = async (l: LintIssue) => {
    const value = fill[l.id]?.trim();
    if (!value) return;
    if (await save(setJournalField(journal.text, template, l.fieldId, value), `Case manager added: ${l.field}`)) {
      setFill((s) => ({ ...s, [l.id]: '' }));
      onDone(`"${l.field}" added. The checks ran again.`);
    }
  };

  const approve = async () => {
    if (!user) return;
    const res = lockJournal(review, user);
    await persist(res.review, res.audit);
    onDone(`Journal version ${journal.version} approved and locked. The CDs report is generated from it.`);
    goCds();
  };

  const lineTone = (line: string, idx: number): { tone: Tone; note: string } | null => {
    const f = fieldForLine(journal.text, template, idx + 1);
    if (!f) return /\[\[CLARIFY/.test(line) ? { tone: 'red', note: 'Needs information' } : null;
    if (missing.some((l) => l.fieldId === f.id)) return { tone: 'red', note: 'Missing' };
    const jf = journalFindings.find((x) => x.journalFieldId === f.id);
    if (jf) return { tone: 'yellow', note: jf.title };
    const fix = aiFixes.find((l) => l.fieldId === f.id);
    if (fix) return { tone: 'blue', note: `AI correction ready: ${fix.kind.toLowerCase()}` };
    return null;
  };
  const open = lint.length + journalFindings.length;

  return (
    <div className="space-y-4">
      <Header n={1} title="Journal Review" text="The journal was checked automatically. AI corrections are in blue for you to approve; anything only you can answer is in red or yellow. Then approve the final journal." />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <ScoreTile label="Journal QA score" value={fmt(scores.journal)} tone={toneFor(scores.journal)} />
        <ScoreTile label="AI corrections ready" value={String(aiFixes.length)} tone={aiFixes.length ? 'blue' : 'green'} sub="spelling, wording, format" />
        <ScoreTile label="Missing information" value={String(missing.length)} tone={missing.length ? 'red' : 'green'} />
        <ScoreTile label="Needs your decision" value={String(journalFindings.length)} tone={journalFindings.length ? 'yellow' : 'green'} sub="conflicts, unclear items" />
      </div>
      {locked && <Notice tone="green" title={`Journal version ${journal.version} is approved and locked`}>The CDs report uses this version. Editing the journal unlocks it and you approve again.</Notice>}
      {error && <Notice tone="red">{error}</Notice>}

      {aiFixes.length > 0 && (
        <Panel title={<span className="flex items-center gap-2"><Sparkles size={18} className="text-navy-700" /> AI corrections <span className="text-sm font-normal text-slate-500">· {aiFixes.length}</span></span>}
          right={<button type="button" disabled={busy || !user} onClick={approveAiFixes} className="bg-navy-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-40">Approve {aiFixes.filter((l) => !rejected[l.id]).length} correction(s)</button>}>
          <p className="px-4 pt-3 text-sm text-slate-600">Only how it is written changes. Facts, dates, numbers and diagnoses stay the same. Untick to reject a correction.</p>
          <ul className="divide-y divide-slate-100">
            {aiFixes.map((l) => (
              <li key={l.id} className={clsx('flex items-start gap-3 border-l-4 px-4 py-3', BAR.blue, rejected[l.id] && 'opacity-50')}>
                <input type="checkbox" className="mt-1 h-5 w-5" aria-label={`Approve correction for ${l.field}`} checked={!rejected[l.id]} onChange={(e) => setRejected((s) => ({ ...s, [l.id]: !e.target.checked }))} />
                <div className="min-w-0 flex-1 text-sm">
                  <p><span className="text-slate-500">{l.section} › </span><b>{l.field}</b> <Pill tone="blue">{l.kind}</Pill></p>
                  <p className="mt-1 text-slate-500 line-through">{l.sentence}</p>
                  <p className="text-slate-900">{l.corrected}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {missing.length > 0 && (
        <Panel title={<>Missing information <span className="text-sm font-normal text-slate-500">· {missing.length}</span></>}>
          <p className="px-4 pt-3 text-sm text-slate-600">The assistant cannot make these up. Add the information, or write "None".</p>
          <ul className="divide-y divide-slate-100">
            {missing.map((l) => (
              <li key={l.id} className={clsx('border-l-4 px-4 py-3', BAR.red)}>
                <p className="text-sm"><span className="text-slate-500">{l.section} › </span><b>{l.field}</b> <Pill tone="red">Missing</Pill></p>
                <p className="text-sm text-slate-600">{l.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input value={fill[l.id] ?? ''} onChange={(e) => setFill((s) => ({ ...s, [l.id]: e.target.value }))} placeholder={`Enter ${l.field}`} aria-label={`Enter ${l.field}`} className="min-w-0 flex-1 basis-60 border border-slate-300 px-3 py-2 text-sm" />
                  <button type="button" disabled={busy || !fill[l.id]?.trim()} onClick={() => addMissing(l)} className="border border-slate-900 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40">Add to journal</button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <AssistantPanel review={review} embedded sections={['Journal']} fillCds={false} title="Needs your decision" onDone={(m) => { onDone(m); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />

      <Panel title={<>Journal <span className="text-sm font-normal text-slate-500">· version {journal.version}</span></>}
        right={!editing ? <><button type="button" onClick={() => { setText(journal.text); setEditing(true); }} className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"><Pencil size={14} /> Edit</button><CopyButton text={journal.text} label="Copy journal" /></> : undefined}>
        {editing ? (
          <div className="space-y-3 p-4">
            <TextArea rows={28} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-[13px] leading-relaxed" aria-label="Journal text" />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || text === journal.text} onClick={async () => { if (await save(text, 'Edited by the case manager')) { setEditing(false); onDone(`Journal version ${journal.version + 1} saved. The checks ran again.`); } }} className="bg-navy-700 px-5 py-3 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-40">{busy ? 'Saving…' : 'Save changes'}</button>
              <button type="button" onClick={() => setEditing(false)} className="border border-slate-300 bg-white px-5 py-3 text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="py-2 text-[15px] leading-relaxed">
            {cleanText(journal.text).split('\n').map((line, i) => {
              const t = lineTone(line, i);
              return (
                <div key={i} className={clsx('flex flex-wrap items-start gap-2 border-l-4 px-4 py-0.5', t ? `${BAR[t.tone]} ${t.tone === 'red' ? 'bg-red-50/60' : t.tone === 'yellow' ? 'bg-amber-50/60' : 'bg-navy-50/50'}` : 'border-l-transparent', /^\s*\d+\)/.test(line) && 'mt-2 font-semibold')}>
                  <span className="min-w-0 flex-1 basis-64 whitespace-pre-wrap">{line || ' '}</span>
                  {t && <span className={clsx('text-[11px] font-medium', t.tone === 'red' ? 'text-red-700' : t.tone === 'yellow' ? 'text-amber-800' : 'text-navy-700')}>{t.note}</span>}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <section className={clsx('flex flex-wrap items-center gap-4 border-[1.5px] p-5', locked ? 'border-emerald-600 bg-emerald-50' : 'border-slate-900 bg-white')}>
        <Lock size={22} className={locked ? 'text-emerald-700' : 'text-slate-700'} />
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-lg font-semibold">{locked ? `Final journal approved (version ${journal.version})` : 'Approve the final journal'}</p>
          <p className="text-sm text-slate-600">{locked ? 'Both the CDs report and the final QA use this exact version.' : open > 0 ? `${open} item(s) are still open. You can approve, but they will show in the final QA.` : 'Everything in the journal checks out. Approving locks this version and generates the CDs report.'}</p>
        </div>
        {!locked ? <button type="button" disabled={!user || busy} onClick={approve} className="bg-emerald-700 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40">Approve & generate CDs report</button>
          : <button type="button" onClick={goCds} className="inline-flex items-center gap-2 bg-slate-900 px-5 py-3 text-sm font-medium text-white">Go to CDs report <ArrowRight size={16} /></button>}
      </section>
    </div>
  );
}

// ======================================================================== 2. CDs Completion Report
function rowTone(r: CdsRow): { tone: Tone; label: string } {
  switch (r.status) {
    case 'Confirmed': return { tone: 'green', label: 'Matched' };
    case 'Suggested': return { tone: 'blue', label: 'AI proposed' };
    case 'Missing': return { tone: 'red', label: 'Missing' };
    case 'Contradictory': return { tone: 'red', label: 'Discrepancy' };
    case 'Needs Clarification': return { tone: 'yellow', label: 'CM to choose' };
    case 'Unable to Verify': return { tone: 'yellow', label: 'CM to verify' };
    default: return { tone: 'green', label: 'Not applicable' };
  }
}

function sourceSection(r: CdsRow, journalText: string, template: JournalTemplate): string {
  const ev = r.c.evidence.find((e) => e.location?.line) ?? r.c.evidence[0];
  const f = fieldForLine(journalText, template, ev?.location?.line ?? null);
  return f ? `${f.group.replace(/^\s*\d+\)\s*/, '')} › ${f.label}` : r.evidence ? 'Journal' : '—';
}

function CdsReport({ review, onDone, goJournal, goQa }: { review: ReviewRecord; onDone: (m: string) => void; goJournal: () => void; goQa: () => void }) {
  const { user, persist } = useApp();
  const { template, journal, scores } = useCaseData(review);
  const locked = journalLocked(review);
  const [busy, setBusy] = useState(false);
  const rows = cdsRows(review);
  const groups = groupBySection(rows);
  const others = review.analysis.cds.filter((c) => !c.mapped && !review.decisions[`cds:${c.fieldId}`]);
  const proposed = rows.filter((r) => r.status === 'Suggested').length;
  const count = (t: Tone) => rows.filter((r) => rowTone(r).tone === t && r.status !== 'Not Applicable').length;

  if (!locked) {
    return (
      <div className="space-y-4">
        <Header n={2} title="CDs Completion Report" text="Generated from the approved journal." />
        <Notice tone="amber" title="Approve the final journal first">The CDs report is generated only from an approved, locked journal so both documents use the same information.</Notice>
        <button type="button" onClick={goJournal} className="border border-slate-900 bg-white px-5 py-3 text-sm font-medium">Go to Journal Review</button>
      </div>
    );
  }
  const acceptAll = async () => {
    if (!user) return;
    setBusy(true);
    try { const m = matchCdsToJournal(review, user); await persist(m.review, m.audit); onDone(`${m.summary.confirmed} AI-proposed answer(s) accepted${m.summary.updated ? `, ${m.summary.updated} corrected to match the journal` : ''}.`); }
    finally { setBusy(false); }
  };
  const confirmOne = async (r: CdsRow) => {
    if (!user || !r.answer) return;
    const res = applyDecision(user, review, 'cds', r.c.fieldId, { status: 'approved', value: r.answer, originalValue: r.answer, note: 'Accepted in the CDs report' });
    await persist(res.review, res.audit);
  };
  const saveCm = async (r: CdsRow, value: string, notApplicable: boolean) => {
    if (!user) return;
    const res = applyDecision(user, review, 'cds', r.c.fieldId, notApplicable
      ? { status: 'rejected', value: '', originalValue: r.answer, note: 'Not applicable — marked by the case manager' }
      : { status: 'edited', value, originalValue: r.answer, note: 'Entered by the case manager from the assessment' });
    await persist(res.review, res.audit);
  };
  return (
    <div className="space-y-4">
      <Header n={2} title="CDs Completion Report" text={<>Every CDS field the journal answers, in WellSky order, with the exact value to enter and where it came from. Generated from journal version {journal.version}. This app does not enter anything in WellSky.</>}
        right={<CopyButton text={confirmedCdsText(review)} label="Copy all matched answers" big />} />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <ScoreTile label="Matched" value={String(count('green'))} tone="green" />
        <ScoreTile label="AI proposed" value={String(count('blue'))} tone="blue" />
        <ScoreTile label="Needs CM review" value={String(count('yellow'))} tone="yellow" />
        <ScoreTile label="Missing / discrepancy" value={String(count('red'))} tone="red" />
      </div>
      <p className="text-sm text-slate-600">CDs report QA score: <b>{fmt(scores.cdsReport)}</b></p>
      {proposed > 0 && (
        <section className="flex flex-wrap items-center gap-3 border border-navy-300 bg-white p-4">
          <Sparkles className="text-navy-700" size={20} />
          <p className="min-w-0 flex-1 basis-64 text-sm"><b>{proposed} answer(s) were taken straight from the journal.</b> Accept them all, or one by one below.</p>
          <button type="button" disabled={busy || !user} onClick={acceptAll} className="bg-navy-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-40">Accept all AI-proposed answers</button>
        </section>
      )}
      <AssistantPanel review={review} embedded sections={['CDS']} title="CDS answers the journal leaves open" onDone={(m) => { onDone(m); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />

      {groups.map((g) => (
        <Panel key={g.name} title={<span className="text-base">{g.name}</span>} right={<CopyButton text={confirmedCdsText(review, g.name)} label="Copy section" />}>
          <div className="hidden grid-cols-[1.3fr_1.2fr_1.1fr_0.9fr_auto] gap-3 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 lg:grid"><span>WellSky field</span><span>Information from the journal</span><span>Enter in WellSky</span><span>Journal section</span><span>Status</span></div>
          <div className="divide-y divide-slate-100">
            {g.rows.map((r) => {
              const t = rowTone(r);
              return (
                <div key={r.c.fieldId} className={clsx('grid gap-1.5 border-l-4 px-4 py-3 lg:grid-cols-[1.3fr_1.2fr_1.1fr_0.9fr_auto] lg:gap-3', BAR[t.tone])}>
                  <p className="text-sm"><span className="text-slate-500">{r.c.code} </span>{r.c.label}</p>
                  <p className="text-xs text-slate-600">{r.evidence ? `“${r.evidence.slice(0, 160)}${r.evidence.length > 160 ? '…' : ''}”` : <span className="text-red-700">Not in the journal</span>}</p>
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="min-w-0 flex-1 text-sm font-medium">{r.answer || (r.c.candidates.length ? <span className="font-normal text-amber-800">Choose: {r.c.candidates.slice(0, 3).join(' / ')}</span> : '—')}</span>
                    {r.answer && <CopyButton text={r.answer} label="Copy" />}
                  </div>
                  <p className="text-xs text-slate-500">{sourceSection(r, journal.text, template)}</p>
                  <div className="flex flex-wrap items-start gap-1.5 lg:flex-col lg:items-end">
                    <Pill tone={t.tone}>{t.label}</Pill>
                    {r.status === 'Suggested' && r.answer && <button type="button" onClick={() => confirmOne(r)} className="text-xs font-medium text-navy-700 underline">Accept</button>}
                  </div>
                  {t.tone !== 'green' && t.tone !== 'blue' && <CmInput row={r} onSave={(v, na) => saveCm(r, v, na)} />}
                </div>
              );
            })}
          </div>
        </Panel>
      ))}
      <details className="border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-base font-semibold">Other CDS fields not covered by the journal ({others.length})</summary>
        <p className="border-t border-slate-200 px-4 py-2 text-sm text-slate-600">Complete these in WellSky from your assessment. Never enter "No" just because something is not written in the journal.</p>
        <div className="max-h-96 overflow-y-auto px-4 pb-3 text-sm">
          {groupBySection(others.map((c) => ({ c }))).map((g) => (
            <div key={g.name} className="py-1.5"><p className="font-medium">{g.name} <span className="text-slate-500">· {g.rows.length}</span></p><p className="text-xs text-slate-600">{g.rows.map((x) => `${x.c.code ? `${x.c.code} ` : ''}${x.c.label}`.slice(0, 70)).join(' · ')}</p></div>
          ))}
        </div>
      </details>
      <NextButton label="Next: Final QA Validation" onClick={goQa} />
    </div>
  );
}

function CmInput({ row, onSave }: { row: CdsRow; onSave: (value: string, notApplicable: boolean) => void }) {
  const [v, setV] = useState('');
  const opts = row.c.candidates;
  return (
    <div className="flex flex-wrap items-center gap-2 lg:col-span-5">
      <span className="text-xs text-slate-500">Your answer:</span>
      {opts.length > 1 ? (
        <select value={v} onChange={(e) => setV(e.target.value)} aria-label={`Answer for ${row.c.label}`} className="min-w-0 flex-1 basis-56 border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <option value="">Choose…</option>{opts.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input value={v} onChange={(e) => setV(e.target.value)} aria-label={`Answer for ${row.c.label}`} placeholder="From your assessment" className="min-w-0 flex-1 basis-56 border border-slate-300 px-2 py-1.5 text-sm" />
      )}
      <button type="button" disabled={!v.trim()} onClick={() => onSave(v.trim(), false)} className="border border-slate-900 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40">Save</button>
      <button type="button" onClick={() => onSave('', true)} className="text-xs text-slate-600 underline">Not applicable</button>
    </div>
  );
}

// ======================================================================== 3. Final QA Validation
const RESULT_LABEL: Record<string, string> = { Complete: 'Complete', Mismatch: 'Needs correction', Missing: 'Missing', 'Needs Review': 'Needs review', 'Unable to Verify': 'Unable to verify', 'Not Applicable': 'Not applicable' };
const RESULT_TONE: Record<string, Tone> = { Complete: 'green', Mismatch: 'red', Missing: 'red', 'Needs Review': 'yellow', 'Unable to Verify': 'yellow', 'Not Applicable': 'green' };

function wellskyCheck(pasted: string, s: ValidationScores) {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const hay = norm(pasted);
  const confirmed = s.comparison.filter((c) => c.result === 'Matched');
  const found = confirmed.filter((c) => { const v = norm(c.cds); return v.length > 0 && hay.includes(v.length > 40 ? v.slice(0, 40) : v); });
  return { total: confirmed.length, found: found.length, notFound: confirmed.filter((c) => !found.includes(c)) };
}

function FinalQa({ review, onDone, goJournal, goCds }: { review: ReviewRecord; onDone: (m: string) => void; goJournal: () => void; goCds: () => void }) {
  const { user, persist } = useApp();
  const { qa, journal, lint, scores } = useCaseData(review);
  const baseline = useBaselineScore(review);
  const locked = journalLocked(review);
  const approved = finalApprovalValid(review);
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState('');
  const s = qa.score;
  const canApprove = locked && scores.unresolved === 0 && scores.cmInput === 0 && !approved;
  const different = scores.comparison.filter((c) => c.result === 'Different');
  const finalApprove = async () => {
    if (!user) return;
    setBusy(true);
    try { const r = approveFinal(review, user, scores.overall, 'Final QA validation approved'); await persist(r.review, r.audit); onDone('Final QA approved. The journal and CDs match.'); } finally { setBusy(false); }
  };
  const check = pasted.trim() ? wellskyCheck(pasted, scores) : null;
  const ready = approved && s.readiness.ready && scores.unresolved === 0;
  return (
    <div className="space-y-4">
      <Header n={3} title="Final QA Validation" text="The approved journal and the CDs report, compared field by field, plus the 17-item QA checklist. Internal estimate only — not an official AgeSpan QA score." />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <ScoreTile label="Journal QA score" value={fmt(scores.journal)} tone={toneFor(scores.journal)} />
        <ScoreTile label="CDs report QA score" value={fmt(scores.cdsReport)} tone={toneFor(scores.cdsReport)} />
        <ScoreTile label="Journal-to-CDs match" value={fmt(scores.matching)} tone={toneFor(scores.matching)} />
        <ScoreTile label="17-item QA estimate" value={`${scores.overall.toFixed(1)} / 100`} tone={toneFor(scores.overall)} sub={baseline !== null ? `started at ${baseline.toFixed(1)}` : undefined} />
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <ScoreTile label="Errors identified" value={String(scores.identified)} />
        <ScoreTile label="Errors corrected" value={String(scores.corrected)} tone="blue" />
        <ScoreTile label="Unresolved" value={String(scores.unresolved)} tone={scores.unresolved ? 'red' : 'green'} />
        <ScoreTile label="Fields needing CM input" value={String(scores.cmInput)} tone={scores.cmInput ? 'yellow' : 'green'} />
      </div>

      <section className={clsx('flex flex-wrap items-center gap-4 border-[1.5px] p-5', ready ? 'border-emerald-600 bg-emerald-50' : 'border-amber-500 bg-white')}>
        {ready ? <CheckCircle2 className="text-emerald-700" size={26} /> : <AlertTriangle className="text-amber-700" size={26} />}
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-xl font-semibold">{ready ? 'Approved — the journal and CDs match' : approved ? 'Approved, but items reopened' : 'Not ready for final approval'}</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
            {!locked && <li>The final journal is not approved. <button type="button" className="underline" onClick={goJournal}>Journal Review</button></li>}
            {lint.length > 0 && <li>{lint.length} journal item(s) still open. <button type="button" className="underline" onClick={goJournal}>Fix</button></li>}
            {scores.cmInput > 0 && <li>{scores.cmInput} CDS field(s) need your input. <button type="button" className="underline" onClick={goCds}>CDs report</button></li>}
            {qa.openFindings.length > 0 && <li>{qa.openFindings.length} issue(s) unresolved (listed below).</li>}
            {ready && <li>Approved by {review.workflow!.finalApproval!.byName} on {new Date(review.workflow!.finalApproval!.at).toLocaleString()}.</li>}
          </ul>
        </div>
        {!approved && <button type="button" disabled={!canApprove || busy || !user} onClick={finalApprove} className="bg-emerald-700 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40">Approve final QA</button>}
      </section>

      <AssistantPanel review={review} embedded sections={['Records']} title="Records to check in WellSky" onDone={(m) => { onDone(m); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />

      {(qa.openFindings.length > 0 || different.length > 0) && (
        <Panel title={<>Discrepancies and open items <span className="text-sm font-normal text-slate-500">· {qa.openFindings.length + different.length}</span></>}>
          <ul className="divide-y divide-slate-100 text-sm">
            {different.map((c) => (
              <li key={c.row.c.fieldId} className={clsx('border-l-4 px-4 py-2', BAR.red)}><Pill tone="red">Discrepancy</Pill> <b>{c.row.c.code} {c.row.c.label}</b> — journal: “{c.journal}”, CDs report: “{c.cds}”</li>
            ))}
            {qa.openFindings.map((f) => {
              const cat = issueCategory(f);
              const tone: Tone = cat === 'Critical' || cat === 'Missing' ? 'red' : 'yellow';
              return <li key={f.id} className={clsx('border-l-4 px-4 py-2', BAR[tone])}><Pill tone={tone}>{cat}</Pill> <b>{f.title}</b></li>;
            })}
          </ul>
        </Panel>
      )}

      <Panel title="Journal and CDs side by side">
        <div className="hidden grid-cols-[1.2fr_1.3fr_1.3fr_auto] gap-3 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 md:grid"><span>CDS field</span><span>Approved journal</span><span>CDs report</span><span>Result</span></div>
        <div className="max-h-[36rem] divide-y divide-slate-100 overflow-y-auto">
          {scores.comparison.map((c) => {
            const tone: Tone = c.result === 'Matched' ? 'green' : c.result === 'Different' ? 'red' : c.result === 'Not confirmed' ? 'blue' : 'yellow';
            return (
              <div key={c.row.c.fieldId} className={clsx('grid gap-1 border-l-4 px-4 py-2 text-sm md:grid-cols-[1.2fr_1.3fr_1.3fr_auto] md:gap-3', BAR[tone])}>
                <span className="text-slate-600">{c.row.c.code} {c.row.c.label}</span>
                <span>{c.journal || '—'}</span>
                <span className="font-medium">{c.cds || '—'}</span>
                <span><Pill tone={tone}>{c.result}</Pill></span>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="17-item QA checklist — the reason for every score">
        <div className="divide-y divide-slate-100">
          {s.categories.map((c) => (
            <div key={c.categoryId} className={clsx('grid gap-1 border-l-4 px-4 py-2.5 text-sm md:grid-cols-[2rem_1.3fr_8rem_5rem_2fr] md:gap-3', BAR[RESULT_TONE[c.status] ?? 'yellow'])}>
              <span className="text-slate-500">{c.number}</span>
              <span className="font-medium">{c.title}{c.attested && <Badge tone="purple" className="ml-1">checked by you</Badge>}</span>
              <span><Pill tone={RESULT_TONE[c.status] ?? 'yellow'}>{RESULT_LABEL[c.status] ?? c.status}</Pill></span>
              <span>{c.applicable ? `${c.earned} / ${c.points}` : 'n/a'}</span>
              <span className="text-slate-600">{c.basis}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="After you enter the CDs in WellSky (optional check)">
        <div className="space-y-2 p-4">
          <p className="text-sm text-slate-600">Paste the CDS text from WellSky. The app checks that every matched answer from the report is there. Remove the consumer's name first.</p>
          <TextArea rows={5} value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Paste CDS text from WellSky" placeholder="Paste here" />
          {check && (
            <Notice tone={check.found === check.total ? 'green' : 'amber'}>
              {check.found} of {check.total} matched answers were found in what you pasted.
              {check.notFound.length > 0 && <span> Not found: {check.notFound.slice(0, 8).map((c) => `${c.row.c.code} ${c.row.c.label.slice(0, 40)}`).join('; ')}{check.notFound.length > 8 ? '…' : ''}</span>}
            </Notice>
          )}
        </div>
      </Panel>
      <p className="text-xs text-slate-500">Journal version {journal.version}{locked ? ' (approved and locked)' : ''}. Scores never show 100 while anything is missing or unresolved.</p>
    </div>
  );
}
