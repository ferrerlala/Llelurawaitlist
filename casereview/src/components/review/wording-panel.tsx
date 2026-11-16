// "Professional wording": shows each line before and after, the case manager keeps what they approve.
import clsx from 'clsx';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { JournalTemplate } from '../../config/journal-template.ts';
import { setJournalField } from '../../workflow/journal-builder.ts';
import { polishJournal, type WordingChange } from '../../workflow/professional-wording.ts';

export function WordingPanel({ text, template, onApply, busy, applyLabel = 'Use the new wording' }: {
  text: string; template: JournalTemplate; onApply: (newText: string, count: number) => void; busy?: boolean; applyLabel?: string;
}) {
  const [changes, setChanges] = useState<WordingChange[] | null>(null);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const key = (c: WordingChange, i: number) => `${c.fieldId}-${i}`;

  if (!changes) {
    return (
      <section className="flex flex-wrap items-center gap-3 border border-navy-300 bg-white p-4">
        <Sparkles className="text-navy-700" size={22} aria-hidden="true" />
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-semibold">Make it sound professional</p>
          <p className="text-sm text-slate-600">Rewrites each line in case management language — full sentences, no shorthand. Facts, dates and numbers are not changed. You approve every change.</p>
        </div>
        <button type="button" onClick={() => { setChanges(polishJournal(text, template).changes); setOff({}); }} className="bg-navy-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-900">Improve wording</button>
      </section>
    );
  }

  const chosen = changes.filter((c, i) => !off[key(c, i)]);
  const apply = () => {
    let out = text;
    for (const c of chosen) out = setJournalField(out, template, c.fieldId, c.after);
    onApply(out, chosen.length);
    setChanges(null);
  };

  return (
    <section className="border border-navy-300 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
        <Sparkles className="text-navy-700" size={20} aria-hidden="true" />
        <p className="min-w-0 flex-1 basis-64 font-semibold">{changes.length ? `${changes.length} line(s) can be worded better` : 'The wording already reads well. Nothing to change.'}</p>
        <button type="button" onClick={() => setChanges(null)} className="text-xs underline">Close</button>
      </div>
      {changes.length > 0 && (
        <>
          <ul className="divide-y divide-slate-100">
            {changes.map((c, i) => (
              <li key={key(c, i)} className={clsx('flex items-start gap-3 px-4 py-3', off[key(c, i)] && 'opacity-50')}>
                <input type="checkbox" className="mt-1 h-5 w-5" aria-label={`Use new wording for ${c.label}`} checked={!off[key(c, i)]} onChange={(e) => setOff((s) => ({ ...s, [key(c, i)]: !e.target.checked }))} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{c.label}</p>
                  <p className="text-slate-500 line-through">{c.before}</p>
                  <p className="text-slate-900">{c.after}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 p-4">
            <button type="button" disabled={busy || !chosen.length} onClick={apply} className="bg-navy-700 px-5 py-3 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-40">{applyLabel} ({chosen.length})</button>
            <span className="text-sm text-slate-600">Untick any line you want to keep as you wrote it.</span>
          </div>
        </>
      )}
    </section>
  );
}
