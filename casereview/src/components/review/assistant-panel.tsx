// Step 1 — the assistant proposes a fix for every open item; the case manager only approves.
// Journal and CDS items are approved by default. WellSky record checks stay off until the case manager
// ticks them, because only a person can confirm a record was checked.
import clsx from 'clsx';
import { Check, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../../app/AppContext.tsx';
import { useAnalyzer } from '../../app/use-analyzer.ts';
import type { ReviewRecord } from '../../data/types.ts';
import { buildProposals, type AiProposal, type Confidence } from '../../workflow/ai-proposals.ts';
import { applyProposals } from '../../workflow/apply-proposals.ts';
import { cdsJournalGaps, latestJournal, matchCdsToJournal } from '../../workflow/engine.ts';
import { readJournalField } from '../../workflow/journal-builder.ts';
import { useIndependentQa } from './workflow-tabs.tsx';
import { journalTemplateFor } from '../../config/journal-template.ts';

const CHIP: Record<Confidence, { label: string; cls: string }> = {
  journal: { label: 'From the journal', cls: 'bg-emerald-700 text-white' },
  guess: { label: 'Best guess — check', cls: 'bg-amber-300 text-amber-950' },
  you: { label: 'You check in WellSky', cls: 'border border-slate-500 text-slate-700' },
};

const SECTION_TITLE: Record<AiProposal['section'], { title: string; help: string }> = {
  Journal: { title: 'Journal fixes', help: 'The assistant rewrote these lines. A new journal version is saved.' },
  CDS: { title: 'CDS answers', help: 'The assistant picked these answers from the journal.' },
  Records: { title: 'WellSky checks', help: 'Only you can confirm these. Tick them after you look in WellSky.' },
};

export function useProposals(review: ReviewRecord): AiProposal[] {
  const { settings } = useApp();
  const qa = useIndependentQa(review);
  return useMemo(() => {
    const covered = new Set(qa.openFindings.map((f) => f.id));
    const cdsChecks = review.analysis.cds.filter((c) => c.mapped && c.status === 'Needs Verification' && !review.decisions[`cds:${c.fieldId}`]
      && !covered.has(`cds_unresolved:${c.fieldId}`) && c.suggestedResponse.trim() && !/^(Select after verification|Unable to determine|Narrative states)/i.test(c.suggestedResponse));
    const recordCds = review.analysis.cds.filter((c) => c.mapped && c.status === 'Needs Verification' && !review.decisions[`cds:${c.fieldId}`]
      && !covered.has(`cds_unresolved:${c.fieldId}`) && /^Narrative states/i.test(c.suggestedResponse));
    const journal = latestJournal(review)?.text ?? '';
    const date = review.input.assessmentDate ? new Date(`${review.input.assessmentDate}T12:00:00`).toLocaleDateString('en-US') : new Date().toLocaleDateString('en-US');
    return buildProposals({
      findings: qa.openFindings, cdsChecks, recordCds, journal, date,
      readField: (id) => { const f = journalTemplateFor(settings, review.input.assessmentType).fields.find((x) => x.id === id); return f ? readJournalField(journal, f) ?? '' : ''; },
    });
  }, [review, qa, settings]);
}

export function AssistantPanel({ review, onDone, embedded, sections, fillCds = true, title }: { review: ReviewRecord; onDone: (summary: string) => void; embedded?: boolean; sections?: AiProposal['section'][]; fillCds?: boolean; title?: string }) {
  const { user, settings, persist } = useApp();
  const analyze = useAnalyzer(review);
  const allProposals = useProposals(review);
  const proposals = sections ? allProposals.filter((p) => sections.includes(p.section)) : allProposals;
  const gaps = sections && !sections.includes('CDS') ? { total: 0, unconfirmed: [], differs: [] } : cdsJournalGaps(review);
  const [open, setOpen] = useState(!!embedded);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  // Per item: which choice, and whether it is approved. Defaults: approve journal/guess items, not record checks.
  const [pick, setPick] = useState<Record<string, number>>({});
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isOn = (p: AiProposal) => on[p.key] ?? p.confidence !== 'you';
  const choiceOf = (p: AiProposal) => pick[p.key] ?? (p.proposed >= 0 ? p.proposed : 0);

  const approved = proposals.filter(isOn);
  const records = proposals.filter((p) => p.section === 'Records');
  const allRecordsOn = records.length > 0 && records.every(isOn);
  const counts = { journal: proposals.filter((p) => p.confidence === 'journal').length, guess: proposals.filter((p) => p.confidence === 'guess').length, you: records.length };

  async function approveAll() {
    if (!user) return;
    setBusy(true); setError('');
    try {
      const res = await applyProposals(review, approved.map((p) => ({ proposal: p, choice: choiceOf(p) })), user, analyze, settings, (t) => setProgress(t), { fillCds });
      setProgress('Saving');
      await persist(res.review, res.audit);
      setPick({}); setOn({}); setExpanded({});
      if (!embedded) setOpen(false);
      onDone(`${res.applied} item(s) approved.${res.cds.confirmed + res.cds.updated ? ` ${res.cds.confirmed + res.cds.updated} CDS answer(s) were filled from the journal.` : ''}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); setProgress(''); }
  }

  async function fillOnly() {
    if (!user) return;
    setBusy(true); setError('');
    try { const m = matchCdsToJournal(review, user); await persist(m.review, m.audit); onDone(`The CDS was filled from the final journal (${m.summary.confirmed + m.summary.updated} answer(s)).`); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (!proposals.length) {
    if (!gaps.total) return embedded ? (
      <div className="flex items-center gap-3 border-[1.5px] border-emerald-700 bg-emerald-50 p-5 text-emerald-900"><Check size={22} /> <p className="text-lg font-semibold">Nothing left to fix. Go to the next step.</p></div>
    ) : null;
    return (
      <section className="flex flex-wrap items-center gap-4 border-[1.5px] border-navy-700 bg-white p-5">
        <p className="min-w-0 flex-1 basis-64 text-base"><b>{gaps.total} CDS answer(s)</b> don't follow the final journal yet.</p>
        <button type="button" disabled={busy} onClick={fillOnly} className="bg-navy-700 px-5 py-3 font-mono text-sm text-white hover:bg-navy-900">Fill the CDS from the journal</button>
      </section>
    );
  }

  if (!open) {
    return (
      <section className="flex flex-wrap items-center gap-4 border-[1.5px] border-navy-700 bg-white p-5">
        <Sparkles className="text-navy-700" size={28} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">The assistant has a fix for every item</h2>
          <p className="text-sm text-slate-600">{proposals.length} item(s). You only look and approve.</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="bg-navy-700 px-5 py-3 font-mono text-sm text-white hover:bg-navy-900">See the fixes →</button>
      </section>
    );
  }

  return (
    <section className="border-[1.5px] border-navy-700 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-5">
        <Sparkles className="text-navy-700" size={24} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">{title ?? `The assistant fixed ${proposals.length} item(s)`}</h2>
          <p className="text-sm text-slate-600">Look them over. Tap <b>Change</b> if something is wrong. Then press <b>Approve</b> at the bottom.</p>
        </div>
        {!embedded && <button type="button" onClick={() => setOpen(false)} className="font-mono text-xs text-slate-600 underline">Close</button>}
      </div>
      <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-3 text-sm">
        <span className={clsx('px-2 py-1 font-mono text-xs', CHIP.journal.cls)}>{counts.journal} from the journal</span>
        {counts.guess > 0 && <span className={clsx('px-2 py-1 font-mono text-xs', CHIP.guess.cls)}>{counts.guess} best guesses — please check</span>}
        {counts.you > 0 && <span className={clsx('px-2 py-1 font-mono text-xs', CHIP.you.cls)}>{counts.you} WellSky checks</span>}
      </div>

      {(['Journal', 'CDS', 'Records'] as const).map((sec) => {
        const items = proposals.filter((p) => p.section === sec);
        if (!items.length) return null;
        return (
          <div key={sec} className="border-b border-slate-200">
            <div className="flex flex-wrap items-center gap-3 bg-slate-50 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold">{SECTION_TITLE[sec].title} <span className="font-mono text-sm font-normal text-slate-500">· {items.length}</span></p>
                <p className="text-sm text-slate-600">{SECTION_TITLE[sec].help}</p>
              </div>
              {sec === 'Records' && (
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" className="h-5 w-5" checked={allRecordsOn}
                    onChange={(e) => setOn((s) => { const n = { ...s }; for (const r of records) n[r.key] = e.target.checked; return n; })} />
                  I checked all of these in WellSky
                </label>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {items.map((p) => {
                const c = p.choices[choiceOf(p)];
                const approvedNow = isOn(p);
                return (
                  <div key={p.key} className={clsx('px-5 py-4', !approvedNow && 'bg-slate-50/60')}>
                    <div className="flex flex-wrap items-start gap-3">
                      <label className="mt-0.5 flex items-center" aria-label={`Approve: ${p.title}`}>
                        <input type="checkbox" className="h-6 w-6" checked={approvedNow} onChange={(e) => setOn((s) => ({ ...s, [p.key]: e.target.checked }))} />
                      </label>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{p.title}</p>
                          <span className={clsx('px-2 py-0.5 font-mono text-[11px]', CHIP[p.confidence].cls)}>{CHIP[p.confidence].label}</span>
                        </div>
                        {p.section !== 'CDS' && <p className="mt-0.5 text-sm text-slate-600">{p.problem}</p>}
                        {p.section === 'Records' ? (
                          <p className="mt-2 text-sm text-slate-700">{p.reason}</p>
                        ) : (
                          <div className={clsx('mt-2 border-l-4 px-3 py-2 text-sm', p.confidence === 'guess' && pick[p.key] === undefined ? 'border-amber-400 bg-amber-50' : 'border-emerald-600 bg-emerald-50')}>
                            <span className="font-mono text-[11px] uppercase text-slate-500">{p.section === 'Journal' ? 'New journal text' : 'Answer'}</span>
                            <p className="text-slate-900">{c?.label}</p>
                            <p className="mt-1 text-xs text-slate-500">{pick[p.key] !== undefined ? 'You chose this.' : p.reason}</p>
                          </div>
                        )}
                        {p.choices.length > 1 && (
                          <button type="button" onClick={() => setExpanded((s) => ({ ...s, [p.key]: !s[p.key] }))}
                            className="mt-2 inline-flex items-center gap-1 font-mono text-xs text-navy-700 underline">
                            Change <ChevronDown size={13} className={expanded[p.key] ? 'rotate-180' : ''} />
                          </button>
                        )}
                        {expanded[p.key] && (
                          <fieldset className="mt-2 space-y-1.5">
                            <legend className="sr-only">Choose the right answer for {p.title}</legend>
                            {p.choices.map((ch, i) => (
                              <label key={ch.id} className={clsx('flex cursor-pointer items-start gap-2 border px-3 py-2 text-sm', choiceOf(p) === i ? 'border-navy-700 bg-navy-50' : 'border-slate-200 bg-white')}>
                                <input type="radio" name={`pick-${p.key}`} className="mt-0.5" checked={choiceOf(p) === i}
                                  onChange={() => { setPick((s) => ({ ...s, [p.key]: i })); setOn((s) => ({ ...s, [p.key]: true })); }} />
                                <span>{ch.label}</span>
                              </label>
                            ))}
                          </fieldset>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t-[1.5px] border-navy-700 bg-white p-5">
        <button type="button" disabled={busy || !approved.length || !user} onClick={approveAll}
          className="bg-navy-700 px-6 py-4 font-mono text-base text-white hover:bg-navy-900 disabled:opacity-40">
          {busy ? 'Working…' : `Approve ${approved.length} fix(es)`}
        </button>
        {busy ? <span className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={15} className="animate-spin" /> {progress}</span>
          : <span className="text-sm text-slate-600">Unticked items are skipped.{fillCds ? ' After the fixes, CDS answers that come straight from the journal are confirmed. Answers you already confirmed are not changed.' : ''}</span>}
        {error && <p className="w-full text-sm text-red-700">{error}</p>}
      </div>
    </section>
  );
}
