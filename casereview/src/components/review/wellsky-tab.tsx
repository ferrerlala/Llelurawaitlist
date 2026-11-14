// "Copy to WellSky": the final approved journal entry and the confirmed CDS answers, ready to paste.
// Only answers the case manager confirmed are offered for entry; everything else is listed as not ready.
import clsx from 'clsx';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import type { CdsResponse } from '../../engine/types.ts';
import type { ReviewRecord } from '../../data/types.ts';
import { latestJournal } from '../../workflow/engine.ts';
import { useIndependentQa } from './workflow-tabs.tsx';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers or frames where the clipboard API is blocked.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

function CopyButton({ text, label = 'Copy', big }: { text: string; label?: string; big?: boolean }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle');
  return (
    <button type="button" onClick={async () => { setState((await copyText(text)) ? 'done' : 'fail'); setTimeout(() => setState('idle'), 2000); }}
      className={clsx('inline-flex shrink-0 items-center gap-1.5 font-mono', big ? 'bg-navy-700 px-4 py-3 text-sm text-white hover:bg-navy-900' : 'border-[1.5px] border-slate-900 bg-white px-3 py-2 text-xs hover:bg-slate-100')}
      aria-label={label}>
      {state === 'done' ? <Check size={14} /> : <Copy size={14} />}
      {state === 'done' ? 'Copied' : state === 'fail' ? 'Select & copy' : label}
    </button>
  );
}

interface Answer { c: CdsResponse; value: string }

const line = (a: Answer) => `${a.c.code ? `${a.c.code} ` : ''}${a.c.label}: ${a.value}`;

export function WellskyTab({ review, goTo }: { review: ReviewRecord; goTo: (tab: 'results' | 'fix') => void }) {
  const qa = useIndependentQa(review);
  const journal = latestJournal(review);
  const journalText = journal?.text ?? '';

  const confirmed: Answer[] = [];
  const unconfirmed: CdsResponse[] = [];
  let notDocumented = 0;
  for (const c of review.analysis.cds) {
    const d = review.decisions[`cds:${c.fieldId}`];
    if (d && (d.status === 'approved' || d.status === 'edited') && d.value.trim()) confirmed.push({ c, value: d.value });
    else if (c.mapped && c.status !== 'Not Documented') unconfirmed.push(c);
    else notDocumented++;
  }
  const sections: { name: string; items: Answer[] }[] = [];
  for (const a of confirmed) {
    const s = sections.find((x) => x.name === a.c.section) ?? (sections.push({ name: a.c.section, items: [] }), sections[sections.length - 1]);
    s.items.push(a);
  }
  const allCds = sections.map((s) => `${s.name}\n${s.items.map(line).join('\n')}`).join('\n\n');
  const ready = qa.score.readiness.ready;

  return (
    <div className="space-y-5">
      <section className={clsx('flex flex-wrap items-center gap-4 border-[1.5px] p-5', ready ? 'border-emerald-700 bg-emerald-50' : 'border-amber-600 bg-white')}>
        <div className="min-w-0 flex-1">
          <p className={clsx('font-mono text-xs uppercase', ready ? 'text-emerald-800' : 'text-amber-700')}>{ready ? 'Ready to enter' : 'Not fully ready'}</p>
          <h2 className="text-xl font-semibold">{ready ? 'Everything is reviewed and fixed.' : `${qa.openFindings.length} item(s) are still open.`}</h2>
          <p className="text-sm text-slate-600">
            {ready ? 'Copy the journal and the CDS answers below into WellSky.' : 'You can copy now, but fix the open items first so what you enter matches what QA will check.'}
            {' '}Score: <b>{qa.score.score.toFixed(1)} / 100</b>.
          </p>
        </div>
        {!ready && <button type="button" onClick={() => goTo('results')} className="border-[1.5px] border-slate-900 bg-white px-4 py-3 font-mono text-sm hover:bg-slate-100">Go to Results →</button>}
      </section>

      {/* 1. Journal */}
      <section className="border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <span className="font-mono text-xs text-slate-500">01</span>
          <h2 className="flex-1 text-lg font-semibold">Final journal entry</h2>
          <span className="font-mono text-xs text-slate-500">v{journal?.version} · approved by {journal?.approvedByName}</span>
          <CopyButton text={journalText} label="Copy journal" big />
        </div>
        <textarea readOnly aria-label="Final journal entry" value={journalText} rows={16}
          className="block w-full resize-y border-0 bg-white p-4 font-mono text-[13px] leading-relaxed text-slate-900 focus:outline-none" onFocus={(e) => e.currentTarget.select()} />
      </section>

      {/* 2. CDS */}
      <section className="border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <span className="font-mono text-xs text-slate-500">02</span>
          <h2 className="flex-1 text-lg font-semibold">CDS answers to enter <span className="font-mono text-sm font-normal text-slate-500">({confirmed.length})</span></h2>
          {confirmed.length > 0 && <CopyButton text={allCds} label="Copy all CDS" big />}
        </div>
        {confirmed.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-600">No CDS answers are confirmed yet. Confirm them on the Results page with the assistant.</p>
        ) : sections.map((s) => (
          <div key={s.name} className="border-b border-slate-100 last:border-0">
            <div className="flex items-center gap-3 bg-slate-50 px-4 py-2">
              <p className="flex-1 font-mono text-xs uppercase text-slate-600">{s.name} · {s.items.length}</p>
              <CopyButton text={`${s.name}\n${s.items.map(line).join('\n')}`} label="Copy section" />
            </div>
            <div className="divide-y divide-slate-100">
              {s.items.map((a) => (
                <div key={a.c.fieldId} className="grid items-start gap-2 px-4 py-2.5 md:grid-cols-[90px_1fr_1fr_auto] md:gap-4">
                  <span className="font-mono text-xs text-slate-500">{a.c.code || '—'}</span>
                  <span className="text-sm text-slate-700">{a.c.label}</span>
                  <span className="text-sm font-medium text-slate-900">{a.value}</span>
                  <CopyButton text={a.value} label="Copy" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* 3. Not ready */}
      <section className="border border-slate-200 bg-white px-4 py-4 text-sm">
        <h2 className="mb-2 text-lg font-semibold">Do not enter yet</h2>
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          <li><b>{unconfirmed.length}</b> CDS answer(s) were prepared but not confirmed. {unconfirmed.length > 0 && <button type="button" className="text-navy-700 underline" onClick={() => goTo('results')}>Confirm them</button>}</li>
          <li><b>{notDocumented}</b> CDS question(s) are not in the journal. Complete these from your assessment in WellSky. Never enter "No" just because it is not written down.</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">This app does not connect to WellSky. Check each answer as you enter it.</p>
      </section>
    </div>
  );
}
