// The progress indicator shown at the top of every case:
// Assessment → Journal → CDS → Corrections → QA → Final Report
import clsx from 'clsx';
import { Check } from 'lucide-react';

export type CaseStep = 'assessment' | 'journal' | 'cds' | 'corrections' | 'qa' | 'final';
export const CASE_STEPS: { id: CaseStep; label: string }[] = [
  { id: 'assessment', label: 'Start' },
  { id: 'journal', label: 'Journal Review' },
  { id: 'cds', label: 'CDs Report' },
  { id: 'qa', label: 'Final QA Validation' },
];

export function CaseProgress({ active, complete, onSelect }: { active: CaseStep; complete: Partial<Record<CaseStep, boolean>>; onSelect?: (s: CaseStep) => void }) {
  return (
    <nav aria-label="Case progress" className="no-print">
      <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {CASE_STEPS.map((s, i) => {
          const isActive = s.id === active;
          const done = !!complete[s.id];
          const state = isActive ? 'Active' : done ? 'Complete' : 'To do';
          const inner = (
            <>
              <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                isActive ? 'bg-white text-slate-900' : done ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-slate-500')}>
                {done && !isActive ? <Check size={14} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold leading-tight sm:text-sm">{s.label}</span>
                <span className={clsx('block text-[11px]', isActive ? 'text-navy-100' : done ? 'text-emerald-700' : 'text-slate-500')}>{state}</span>
              </span>
            </>
          );
          const cls = clsx('flex h-full w-full items-center gap-2 border px-2 py-2 text-left sm:px-2.5',
            isActive ? 'border-slate-900 bg-slate-900 text-white' : done ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-white');
          return (
            <li key={s.id} aria-current={isActive ? 'step' : undefined}>
              {onSelect ? <button type="button" className={clsx(cls, !isActive && 'hover:border-slate-900')} onClick={() => onSelect(s.id)}>{inner}</button> : <div className={cls}>{inner}</div>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
