// The simple, guided case screen: three big steps anyone can follow.
//   1. Approve the fixes   2. Check the score   3. Copy to WellSky
import clsx from 'clsx';
import { ArrowRight, Check, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../app/AppContext.tsx';
import type { ReviewRecord } from '../../data/types.ts';
import { approveFinal, cdsJournalGaps, finalApprovalValid } from '../../workflow/engine.ts';
import { AssistantPanel, useProposals } from './assistant-panel.tsx';
import { QaLens, useBaselineScore } from './results-tab.tsx';
import { WellskyTab } from './wellsky-tab.tsx';
import { useIndependentQa } from './workflow-tabs.tsx';

type Step = 1 | 2 | 3;

export function GuideView({ review, onAdvanced }: { review: ReviewRecord; onAdvanced: () => void }) {
  const qa = useIndependentQa(review);
  const { user, persist } = useApp();
  const [approving, setApproving] = useState(false);
  const approved = finalApprovalValid(review);
  const onlyApprovalLeft = !qa.score.readiness.ready && !approved && qa.openFindings.length === 0;
  const approveNow = async () => {
    if (!user) return;
    setApproving(true);
    try { const res = approveFinal(review, user, qa.score.score, 'Approved in the simple guide'); await persist(res.review, res.audit); setDone('You approved the final documentation.'); }
    finally { setApproving(false); }
  };
  const proposals = useProposals(review);
  const baseline = useBaselineScore(review);
  const [step, setStep] = useState<Step>(1);
  const [done, setDone] = useState('');
  const toFix = proposals.filter((p) => p.confidence !== 'you').length;
  const checks = proposals.length - toFix;
  const s = qa.score;
  const stepDone: Record<Step, boolean> = { 1: toFix === 0 && cdsJournalGaps(review).total === 0, 2: s.readiness.ready, 3: false };

  const steps: { n: Step; title: string; sub: string }[] = [
    { n: 1, title: 'Approve the fixes', sub: toFix ? `${toFix} fix(es) ready${checks ? ` · ${checks} WellSky check(s)` : ''}` : checks ? `${checks} WellSky check(s) left` : 'All done' },
    { n: 2, title: 'Check the score', sub: `${s.score.toFixed(1)} / 100` },
    { n: 3, title: 'Copy to WellSky', sub: 'Journal and CDS' },
  ];

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <nav aria-label="Steps" className="grid gap-2 md:grid-cols-3">
        {steps.map((st) => (
          <button key={st.n} type="button" onClick={() => setStep(st.n)} aria-current={step === st.n ? 'step' : undefined}
            className={clsx('flex items-center gap-3 border-[1.5px] p-4 text-left', step === st.n ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:border-slate-900')}>
            <span className={clsx('grid h-10 w-10 shrink-0 place-items-center font-mono text-lg', step === st.n ? 'bg-white text-slate-900' : stepDone[st.n] ? 'bg-emerald-700 text-white' : 'border-[1.5px] border-slate-900')}>
              {stepDone[st.n] && step !== st.n ? <Check size={20} /> : st.n}
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-semibold">{st.title}</span>
              <span className={clsx('block font-mono text-xs', step === st.n ? 'text-navy-100' : 'text-slate-500')}>{st.sub}</span>
            </span>
          </button>
        ))}
      </nav>

      {done && (
        <div className="flex flex-wrap items-center gap-3 border-[1.5px] border-emerald-700 bg-emerald-50 px-5 py-4 text-emerald-900">
          <CheckCircle2 size={20} /> <span className="flex-1"><b>Done.</b> {done}</span>
          <button type="button" className="font-mono text-xs underline" onClick={() => setDone('')}>OK</button>
        </div>
      )}

      {step === 1 && (
        <>
          <Intro n={1} title="Approve the fixes" text="The assistant read the journal and the CDS and fixed what doesn't match. Look it over and press Approve." />
          <AssistantPanel review={review} embedded onDone={(m) => { setDone(m); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
          <NextButton onClick={() => setStep(2)} label="Next: check the score" />
        </>
      )}

      {step === 2 && (
        <>
          <Intro n={2} title="Check the score" text="This is what QA would likely see now. Green means it makes sense. Anything else, go back to step 1." />
          <section className="flex flex-wrap items-stretch gap-4">
            <div className="flex flex-1 basis-80 flex-col gap-3 bg-slate-900 p-6 text-white">
              <span className="font-mono text-xs uppercase text-navy-200">QA score estimate</span>
              <div className="flex flex-wrap items-end gap-5">
                {baseline !== null && Math.abs(baseline - s.score) >= 0.05 && (
                  <>
                    <div><p className="font-mono text-xs text-navy-200">BEFORE</p><p className="text-4xl text-navy-200 line-through decoration-1">{baseline.toFixed(1)}</p></div>
                    <ArrowRight className="mb-2 text-navy-200" size={24} aria-hidden="true" />
                  </>
                )}
                <div><p className="font-mono text-xs text-navy-200">NOW</p><p className="text-6xl font-semibold leading-none">{s.score.toFixed(1)}<span className="text-xl text-navy-200"> / 100</span></p></div>
              </div>
              <div className="h-2 bg-slate-700"><div className="h-2 bg-navy-300" style={{ width: `${Math.max(0, Math.min(100, s.score))}%` }} /></div>
              <p className="text-xs text-navy-200">Internal estimate. A person in QA makes the final call.</p>
            </div>
            <div className={clsx('flex flex-1 basis-72 flex-col justify-center gap-2 border-[1.5px] p-6', s.readiness.ready ? 'border-emerald-700 bg-emerald-50' : 'border-red-700 bg-white')}>
              <p className="text-2xl font-semibold">{s.readiness.ready ? 'Ready for QA' : 'Not ready yet'}</p>
              {onlyApprovalLeft ? (
                <>
                  <p className="text-sm text-slate-700">Everything is fixed. Your final approval is the last step.</p>
                  <button type="button" disabled={approving || !user} onClick={approveNow} className="mt-1 self-start bg-emerald-700 px-5 py-3 font-mono text-sm text-white hover:bg-emerald-800 disabled:opacity-40">Approve final documentation</button>
                </>
              ) : !s.readiness.ready && (
                <>
                  <ul className="list-disc pl-5 text-sm text-slate-700">{s.readiness.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  <button type="button" onClick={() => setStep(1)} className="mt-1 self-start border-[1.5px] border-slate-900 bg-white px-4 py-2 font-mono text-sm hover:bg-slate-100">← Back to step 1</button>
                </>
              )}
            </div>
          </section>
          <QaLens qa={qa.qa} />
          <NextButton onClick={() => setStep(3)} label="Next: copy to WellSky" />
        </>
      )}

      {step === 3 && (
        <>
          <Intro n={3} title="Copy to WellSky" text="Press Copy, then paste into WellSky. Do the journal first, then the CDS." />
          <WellskyTab review={review} goTo={() => setStep(1)} />
        </>
      )}

      <p className="pt-2 text-center"><button type="button" onClick={onAdvanced} className="font-mono text-xs text-slate-500 underline">Show all tools (advanced)</button></p>
    </div>
  );
}

function Intro({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div>
      <p className="font-mono text-xs uppercase text-slate-500">Step {n} of 3</p>
      <h2 className="text-3xl font-semibold">{title}</h2>
      <p className="mt-1 max-w-3xl text-base text-slate-700">{text}</p>
    </div>
  );
}

function NextButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="flex justify-end">
      <button type="button" onClick={() => { onClick(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        className="inline-flex items-center gap-2 bg-slate-900 px-6 py-4 font-mono text-base text-white hover:bg-slate-700">{label} <ArrowRight size={18} /></button>
    </div>
  );
}
