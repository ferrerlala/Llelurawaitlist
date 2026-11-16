import { Check, Pencil, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../app/AppContext.tsx';
import { applyDecision, clearDecision, decisionKey, type DecisionKind } from '../../data/review-actions.ts';
import type { ReviewRecord } from '../../data/types.ts';
import { Badge, Button, Input, Select } from '../ui.tsx';

export function useReviewMutation(_review?: ReviewRecord) {
  const { persist } = useApp();
  const [error, setError] = useState('');
  return {
    error,
    async run(fn: () => { review: ReviewRecord; audit: Parameters<typeof persist>[1] }) {
      setError('');
      try {
        const res = fn();
        await persist(res.review, res.audit);
      } catch (e) {
        setError((e as Error).message);
      }
    },
  };
}

/** Approve / edit / reject controls for one AI suggestion. The original suggestion is always kept. */
export function DecisionControls({ review, kind, itemId, suggested, compact = false, options = [], multiple = false }: { review: ReviewRecord; kind: DecisionKind; itemId: string; suggested: string; compact?: boolean; options?: string[]; multiple?: boolean }) {
  const { user } = useApp();
  const m = useReviewMutation(review);
  const d = review.decisions[decisionKey(kind, itemId)];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(d?.value ?? suggested);
  const [note, setNote] = useState(d?.note ?? '');
  if (!user) return null;

  const decide = (status: 'approved' | 'rejected' | 'edited', v: string) =>
    m.run(() => applyDecision(user, review, kind, itemId, { status, value: v, originalValue: suggested, note }));

  if (editing) {
    return (
      <div className="space-y-1.5">
        {options.length > 0 && (
          <Select aria-label="Answer choice" value="" onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setValue(multiple && value && value !== suggested && !value.includes(v) ? `${value}; ${v}` : v);
          }}>
            <option value="">{multiple ? 'Add an answer choice…' : 'Choose the verified answer…'}</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        )}
        <Input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Verified value" />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reviewer note / source verified (optional)" aria-label="Note" />
        <div className="flex gap-1.5">
          <Button size="sm" variant="primary" onClick={async () => { await decide(value === suggested ? 'approved' : 'edited', value); setEditing(false); }}>Save verified value</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {d && (
        <div className="text-xs">
          <Badge>{d.status}</Badge>
          {d.status === 'edited' && <span className="ml-1 font-medium text-slate-800">→ {d.value}</span>}
          <span className="ml-1 text-slate-500">by {d.byName}</span>
          {d.note && <p className="mt-0.5 text-slate-500">Note: {d.note}</p>}
        </div>
      )}
      <div className={compact ? 'flex gap-1' : 'flex flex-wrap gap-1'}>
        <Button size="sm" variant="ghost" title="Approve" onClick={() => decide('approved', suggested)} className="text-emerald-700"><Check size={13} />{!compact && 'Approve'}</Button>
        <Button size="sm" variant="ghost" title="Edit" onClick={() => { setValue(d?.value ?? suggested); setEditing(true); }}><Pencil size={13} />{!compact && 'Edit'}</Button>
        <Button size="sm" variant="ghost" title="Reject" onClick={() => decide('rejected', suggested)} className="text-red-700"><X size={13} />{!compact && 'Reject'}</Button>
        {d && <Button size="sm" variant="ghost" title="Reset to pending" onClick={() => m.run(() => clearDecision(user, review, kind, itemId))}><RotateCcw size={13} /></Button>}
      </div>
      {m.error && <p className="text-xs text-red-700">{m.error}</p>}
    </div>
  );
}
