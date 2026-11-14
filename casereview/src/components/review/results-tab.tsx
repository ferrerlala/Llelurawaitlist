// "Results" — one simple screen per case: the QA score (start → now), what is missing,
// what must be fixed to pass QA, journal vs CDS mismatches, and every correction made (before → after).
import clsx from 'clsx';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../../app/AppContext.tsx';
import type { ReviewRecord } from '../../data/types.ts';
import { JOURNAL_DOC_ID } from '../../workflow/engine.ts';
import { runIndependentQa } from '../../workflow/independent-qa.ts';
import type { ConsistencyFinding } from '../../workflow/types.ts';
import { useIndependentQa } from './workflow-tabs.tsx';
import { AssistantPanel } from './assistant-panel.tsx';
import type { QaResult } from '../../engine/types.ts';

const MISMATCH_KINDS = new Set(['journal_conflict', 'cds_contradiction']);

/** Score of the case as first approved: first journal version, no case manager decisions or fixes. */
function useBaselineScore(review: ReviewRecord): number | null {
  const { settings } = useApp();
  return useMemo(() => {
    const wf = review.workflow;
    if (!wf || !wf.journal.versions.length) return null;
    const v0 = wf.journal.versions[0];
    const base: ReviewRecord = {
      ...review,
      decisions: {},
      input: { ...review.input, documents: review.input.documents.map((d) => (d.id === JOURNAL_DOC_ID ? { ...d, text: v0.text } : d)) },
      workflow: { ...wf, journal: { ...wf.journal, versions: [v0] }, findingStates: {}, attestations: {} },
    };
    return runIndependentQa(base, settings).score.score;
  }, [review, settings]);
}

function Section({ n, title, count, tone, children, empty }: { n: string; title: string; count: number; tone: 'red' | 'amber' | 'blue' | 'green'; children: ReactNode; empty: string }) {
  const bar = { red: 'bg-red-700', amber: 'bg-amber-600', blue: 'bg-navy-700', green: 'bg-emerald-700' }[tone];
  return (
    <section className="border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <span className={clsx('h-6 w-1.5', bar)} aria-hidden="true" />
        <span className="font-mono text-xs text-slate-500">{n}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="ml-auto font-mono text-sm font-medium">{count}</span>
      </div>
      {count === 0 ? <p className="flex items-center gap-2 px-4 py-4 text-sm text-emerald-800"><CheckCircle2 size={16} /> {empty}</p> : <div className="divide-y divide-slate-100">{children}</div>}
    </section>
  );
}

function FixLink({ onFix }: { onFix: () => void }) {
  return <button type="button" onClick={onFix} className="shrink-0 border-[1.5px] border-slate-900 bg-white px-3 py-2 font-mono text-xs hover:bg-slate-100">Fix →</button>;
}

export function ResultsTab({ review, goTo }: { review: ReviewRecord; goTo: (tab: 'fix' | 'score' | 'journal' | 'wellsky') => void }) {
  const qa = useIndependentQa(review);
  const [done, setDone] = useState('');
  const baseline = useBaselineScore(review);
  const s = qa.score;
  const now = s.score;

  // 1. Must fix to pass QA: critical/high findings + QA categories in Mismatch or Missing.
  const mustFix = qa.openFindings.filter((f) => f.severity === 'Critical' || f.severity === 'High');
  const covers = (f: ConsistencyFinding, cat: string) => f.qaCategoryIds.includes(cat) || f.id.endsWith(`qa_${cat}`);
  const failingQa = qa.qa.filter((q) => (q.status === 'Mismatch' || q.status === 'Missing') && !mustFix.some((f) => covers(f, q.categoryId)));
  const findingFor = (cat: string) => qa.openFindings.find((f) => covers(f, cat));
  const fix = (findingId?: string) => {
    goTo('fix');
    if (findingId) setTimeout(() => document.getElementById(`finding-${findingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
  };

  // 2. Missing documentation.
  const missing: { area: string; item: string; findingId?: string }[] = [];
  for (const q of qa.qa) if (q.status === 'Missing') for (const e of q.evidenceMissing) missing.push({ area: q.title, item: e, findingId: findingFor(q.categoryId)?.id });
  for (const f of qa.openFindings) if (f.kind === 'journal_missing' && !f.id.includes('qa_') && !/^QA \d/.test(f.title)) missing.push({ area: f.journalSection ?? f.category, item: f.title, findingId: f.id });

  // 3. Journal vs CDS mismatches.
  const mismatches = qa.openFindings.filter((f) => MISMATCH_KINDS.has(f.kind));

  // 4. Corrections made.
  const corrections = qa.closedFindings.filter(({ state }) => state.status !== 'rejected');
  const qaChanges = review.workflow?.lastRerun?.changedQa ?? [];
  const versions = review.workflow?.journal.versions ?? [];

  return (
    <div className="space-y-5">
      {/* Score */}
      <section className="flex flex-wrap items-stretch gap-4">
        <div className="flex flex-1 basis-80 flex-col gap-3 bg-slate-900 p-6 text-white">
          <span className="font-mono text-xs uppercase text-navy-200">QA score estimate</span>
          <div className="flex flex-wrap items-end gap-5">
            {baseline !== null && Math.abs(baseline - now) >= 0.05 && (
              <>
                <div><p className="font-mono text-xs text-navy-200">BEFORE</p><p className="text-4xl text-navy-200 line-through decoration-1">{baseline.toFixed(1)}</p></div>
                <ArrowRight className="mb-2 text-navy-200" size={24} aria-hidden="true" />
              </>
            )}
            <div><p className="font-mono text-xs text-navy-200">NOW</p><p className="text-6xl font-semibold leading-none">{now.toFixed(1)}<span className="text-xl text-navy-200"> / 100</span></p></div>
          </div>
          <div className="h-2 bg-slate-700"><div className="h-2 bg-navy-300" style={{ width: `${Math.max(0, Math.min(100, now))}%` }} /></div>
          <p className="text-xs text-navy-200">{s.band}. Internal estimate — the human QA reviewer makes the final call.</p>
        </div>
        <div className={clsx('flex flex-1 basis-72 flex-col justify-center gap-2 border-[1.5px] p-6', s.readiness.ready ? 'border-emerald-700 bg-emerald-50' : 'border-red-700 bg-white')}>
          <span className={clsx('font-mono text-xs uppercase', s.readiness.ready ? 'text-emerald-800' : 'text-red-700')}>{s.readiness.ready ? 'Ready' : 'Not ready'}</span>
          <p className="text-2xl font-semibold">{s.readiness.ready ? 'Ready for human QA review' : `${mustFix.length + failingQa.length} item(s) to fix before QA`}</p>
          {!s.readiness.ready && <ul className="list-disc pl-5 text-sm text-slate-700">{s.readiness.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          <button type="button" onClick={() => goTo('score')} className="self-start font-mono text-xs text-navy-700 underline">See the 17-category breakdown</button>
        </div>
      </section>

      {/* Quick counts */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Must fix', value: mustFix.length + failingQa.length, tone: 'text-red-700' },
          { label: 'Missing', value: missing.length, tone: 'text-amber-700' },
          { label: 'Journal ≠ CDS', value: mismatches.length, tone: 'text-navy-700' },
          { label: 'Corrected', value: corrections.length, tone: 'text-emerald-700' },
        ].map((c) => (
          <div key={c.label} className="border border-slate-200 bg-white p-4">
            <p className="font-mono text-xs uppercase text-slate-500">{c.label}</p>
            <p className={clsx('text-3xl font-semibold', c.tone)}>{c.value}</p>
          </div>
        ))}
      </div>

      {done && (
        <div className="flex flex-wrap items-center gap-3 border-[1.5px] border-emerald-700 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
          <CheckCircle2 size={18} /> <span className="flex-1"><b>Done.</b> {done} The score and every list on this page were re-checked.</span>
          <button type="button" className="font-mono text-xs underline" onClick={() => setDone('')}>Dismiss</button>
        </div>
      )}
      <AssistantPanel review={review} onDone={setDone} />

      <Section n="01" title="Must fix to pass QA" count={mustFix.length + failingQa.length} tone="red" empty="Nothing blocking QA.">
        {mustFix.map((f) => <FindingRow key={f.id} f={f} onFix={() => fix(f.id)} />)}
        {failingQa.map((q) => (
          <div key={q.categoryId} className="flex flex-wrap items-start gap-3 px-4 py-3">
            <span className="w-24 shrink-0 bg-red-700 px-2 py-1 text-center font-mono text-[11px] text-white">QA {q.number}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{q.title} — {q.status}</p>
              <p className="text-sm text-slate-600">{q.recommendedCorrection}</p>
            </div>
            <FixLink onFix={() => fix(findingFor(q.categoryId)?.id)} />
          </div>
        ))}
      </Section>

      <Section n="02" title="What is missing" count={missing.length} tone="amber" empty="No missing documentation found.">
        {missing.map((m, i) => (
          <div key={`${m.item}-${i}`} className="flex flex-wrap items-start gap-3 px-4 py-3">
            <span className="w-40 shrink-0 font-mono text-xs uppercase text-slate-500">{m.area}</span>
            <p className="min-w-0 flex-1 text-sm">{m.item}</p>
            <FixLink onFix={() => fix(m.findingId)} />
          </div>
        ))}
      </Section>

      <Section n="03" title="Journal vs CDS mismatches" count={mismatches.length} tone="blue" empty="The journal and CDS agree.">
        <div className="hidden grid-cols-[1fr_1fr_1fr_auto] gap-4 bg-slate-50 px-4 py-2 md:grid">
          <span className="font-mono text-xs uppercase text-slate-500">Journal says</span>
          <span className="font-mono text-xs uppercase text-slate-500">CDS says</span>
          <span className="font-mono text-xs uppercase text-slate-500">The problem</span>
          <span />
        </div>
        {mismatches.map((f) => (
          <div key={f.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_1fr_1fr_auto] md:gap-4">
            <p className="text-sm"><span className="font-mono text-[11px] text-slate-500 md:hidden">JOURNAL · </span>{f.journalInfo || '—'}</p>
            <p className="text-sm"><span className="font-mono text-[11px] text-slate-500 md:hidden">CDS · </span>{f.cdsAnswer || '—'}</p>
            <p className="text-sm text-red-800"><b className="text-slate-900">{f.title}.</b> {f.mismatch}</p>
            <div><FixLink onFix={() => fix(f.id)} /></div>
          </div>
        ))}
      </Section>

      <Section n="04" title="Corrections made" count={corrections.length + qaChanges.length} tone="green" empty="No corrections yet. Fix an item above and it will show here, before and after.">
        {corrections.map(({ finding, state }) => (
          <div key={finding.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_1fr_1fr] md:gap-4">
            <p className="text-sm font-medium">{finding.title}</p>
            <p className="text-sm text-slate-500 line-through">{state.before || finding.mismatch || finding.journalInfo || finding.cdsAnswer || 'Not documented'}</p>
            <p className="text-sm text-emerald-800">
              {state.value || state.note || state.status.replace(/_/g, ' ')}
              <span className="block font-mono text-[11px] text-slate-500">{state.byName} · {new Date(state.at).toLocaleDateString()}</span>
            </p>
          </div>
        ))}
        {qaChanges.map((q) => (
          <div key={q.categoryId} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_1fr_1fr] md:gap-4">
            <p className="text-sm font-medium">QA: {q.title}</p>
            <p className="text-sm text-slate-500 line-through">{q.before}</p>
            <p className="text-sm text-emerald-800">{q.after}</p>
          </div>
        ))}
      </Section>
      <QaLens qa={qa.qa} />
      <section className="flex flex-wrap items-center gap-4 border-[1.5px] border-slate-900 bg-white p-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{s.readiness.ready ? 'All set — copy it into WellSky' : 'When you are done fixing'}</h2>
          <p className="text-sm text-slate-600">Get the final journal entry and the confirmed CDS answers, ready to copy and paste.</p>
        </div>
        <button type="button" onClick={() => goTo('wellsky')} className="bg-slate-900 px-5 py-3 font-mono text-sm text-white hover:bg-slate-700">Copy to WellSky →</button>
      </section>
      {versions.length > 1 && (
        <p className="text-sm text-slate-600">The journal was updated {versions.length - 1} time(s). <button type="button" onClick={() => goTo('journal')} className="text-navy-700 underline">Compare journal versions</button></p>
      )}
    </div>
  );
}

function FindingRow({ f, onFix }: { f: ConsistencyFinding; onFix: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-3 px-4 py-3">
      <span className={clsx('w-24 shrink-0 px-2 py-1 text-center font-mono text-[11px] uppercase', f.severity === 'Critical' ? 'bg-red-700 text-white' : 'border border-amber-700 text-amber-800')}>{f.severity}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{f.title}</p>
        <p className="text-sm text-slate-600">{f.suggestedCorrection}</p>
      </div>
      <FixLink onFix={onFix} />
    </div>
  );
}

const LENS: Record<string, { label: string; cls: string; rank: number }> = {
  Mismatch: { label: "Doesn't match", cls: 'bg-red-700 text-white', rank: 0 },
  Missing: { label: 'Missing', cls: 'bg-amber-600 text-white', rank: 1 },
  'Needs Review': { label: 'Needs a look', cls: 'border border-amber-700 text-amber-800', rank: 2 },
  'Unable to Verify': { label: 'Check the record', cls: 'border border-slate-500 text-slate-700', rank: 3 },
  Complete: { label: 'Makes sense', cls: 'bg-emerald-700 text-white', rank: 4 },
  'Not Applicable': { label: 'Not applicable', cls: 'border border-slate-300 text-slate-500', rank: 5 },
};

/** The 17 QA categories as a human QA reviewer will read them. */
function QaLens({ qa }: { qa: QaResult[] }) {
  const rows = [...qa].sort((a, b) => (LENS[a.status]?.rank ?? 9) - (LENS[b.status]?.rank ?? 9) || a.number - b.number);
  const n = (st: string) => qa.filter((q) => q.status === st).length;
  return (
    <section className="border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <span className="h-6 w-1.5 bg-slate-900" aria-hidden="true" />
        <span className="font-mono text-xs text-slate-500">05</span>
        <h2 className="text-lg font-semibold">What the QA reviewer will look at</h2>
      </div>
      <p className="px-4 pt-3 text-sm">
        <b className="text-emerald-800">{n('Complete')} of {qa.length} make sense.</b>{' '}
        {n('Mismatch') > 0 && <b className="text-red-700">{n('Mismatch')} don't match. </b>}
        {n('Missing') > 0 && <b className="text-amber-700">{n('Missing')} missing. </b>}
        {n('Needs Review') + n('Unable to Verify') > 0 && <span className="text-slate-700">{n('Needs Review') + n('Unable to Verify')} need a record check or a closer look.</span>}
      </p>
      <div className="mt-2 divide-y divide-slate-100">
        {rows.map((q) => {
          const l = LENS[q.status] ?? LENS['Needs Review'];
          const ok = q.status === 'Complete' || q.status === 'Not Applicable';
          return (
            <div key={q.categoryId} className="grid gap-2 px-4 py-3 md:grid-cols-[150px_1fr_1fr] md:gap-4">
              <span className={clsx('self-start px-2 py-1 text-center font-mono text-[11px] uppercase', l.cls)}>{l.label}</span>
              <div>
                <p className="font-medium">{q.number}. {q.title}</p>
                <p className="text-xs text-slate-500">QA looks for: {q.requirements.slice(0, 3).join('; ')}{q.requirements.length > 3 ? '…' : ''}</p>
              </div>
              <p className={clsx('text-sm', ok ? 'text-emerald-800' : 'text-slate-800')}>
                {ok ? (q.evidenceFound[0] ? `Found: ${q.evidenceFound[0].text.slice(0, 160)}` : 'Nothing required.') : q.recommendedCorrection}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
