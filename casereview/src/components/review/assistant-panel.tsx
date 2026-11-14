// Assistant: prepares a fix for every open finding, the case manager reviews and approves them all at once.
// The assistant never invents facts: anything it cannot know (an assistance level, a WellSky record,
// missing narrative) is left for the case manager to choose, confirm or write before approval.
import clsx from 'clsx';
import { Loader2, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../../app/AppContext.tsx';
import { useAnalyzer } from '../../app/use-analyzer.ts';
import { applyDecision } from '../../data/review-actions.ts';
import type { AuditEntry, ReviewRecord } from '../../data/types.ts';
import { readJournalField } from '../../workflow/journal-builder.ts';
import { applyFindingAction, latestJournal, type FindingAction } from '../../workflow/engine.ts';
import { runIndependentQa } from '../../workflow/independent-qa.ts';
import type { ConsistencyFinding } from '../../workflow/types.ts';
import { useIndependentQa } from './workflow-tabs.tsx';

type Group = 'auto' | 'choose' | 'verify' | 'write';
interface Proposal { finding: ConsistencyFinding; group: Group }

function groupOf(f: ConsistencyFinding): Group {
  if (f.kind === 'record_verification') return 'verify';
  if (f.options.length === 1) return 'auto';
  if (f.options.length > 1) return 'choose';
  return 'write';
}

const GROUPS: { id: Group; title: string; help: string }[] = [
  { id: 'auto', title: 'Ready to fix', help: 'The assistant can fix these from what the journal already says.' },
  { id: 'choose', title: 'Pick the right answer', help: 'The journal supports more than one answer. Choose what is true — the assistant will not guess.' },
  { id: 'verify', title: 'Confirm you checked the record', help: 'Tick only what you have actually checked in WellSky or the file.' },
  { id: 'write', title: 'Add missing information', help: 'Write what happened. Leave blank to skip for now.' },
];

export function AssistantPanel({ review, onDone }: { review: ReviewRecord; onDone: (summary: string) => void }) {
  const { user, settings, persist } = useApp();
  const analyze = useAnalyzer(review);
  const qa = useIndependentQa(review);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const proposals: Proposal[] = useMemo(() => qa.openFindings.map((f) => ({ finding: f, group: groupOf(f) })), [qa]);
  const readyCds = review.analysis.cds.filter((c) => c.mapped && c.status === 'Ready for Review' && !review.decisions[`cds:${c.fieldId}`]);

  const [autoOn, setAutoOn] = useState<Record<string, boolean>>({});
  const [confirmCds, setConfirmCds] = useState(true);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [verifyNote, setVerifyNote] = useState(`Verified in WellSky on ${new Date().toLocaleDateString()}`);
  const [written, setWritten] = useState<Record<string, string>>({});

  const fieldText = (f: ConsistencyFinding) => {
    const field = settings.journalTemplate.fields.find((x) => x.id === f.journalFieldId);
    return field ? readJournalField(latestJournal(review)!.text, field) ?? '' : '';
  };

  const planned = proposals.filter(({ finding: f, group }) =>
    (group === 'auto' && autoOn[f.id] !== false) || (group === 'choose' && !!choice[f.id]) ||
    (group === 'verify' && !!verified[f.id]) || (group === 'write' && !!written[f.id]?.trim() && written[f.id].trim() !== fieldText(f).trim()));
  const total = planned.length + (confirmCds && readyCds.length ? 1 : 0);

  async function applyAll() {
    if (!user) return;
    setBusy(true); setError('');
    let r = review;
    const entries: AuditEntry[] = [];
    let applied = 0;
    try {
      if (confirmCds) {
        for (const c of readyCds) {
          const res = applyDecision(user, r, 'cds', c.fieldId, { status: 'approved', value: c.suggestedResponse, originalValue: c.suggestedResponse, note: 'Approved through the assistant (single supported answer)' });
          r = res.review; entries.push(...res.audit);
        }
      }
      for (const { finding, group } of planned) {
        setProgress(`Fixing: ${finding.title}`);
        // Re-read the current findings: an earlier fix may already have resolved or reshaped this one.
        const current = runIndependentQa(r, settings).openFindings.find((f) => f.id === finding.id);
        if (!current) continue;
        let action: FindingAction | null = null;
        if (group === 'auto') action = { type: 'accept_option', optionId: current.options[0].id, note: 'Approved through the assistant' };
        if (group === 'choose') {
          const label = finding.options.find((o) => o.id === choice[finding.id])?.label;
          const opt = current.options.find((o) => o.label === label);
          if (opt) action = { type: 'accept_option', optionId: opt.id, note: 'Chosen by the case manager in the assistant' };
        }
        if (group === 'verify') action = { type: 'attest', text: verifyNote };
        if (group === 'write' && current.journalFieldId) action = { type: 'provide_info', fieldId: current.journalFieldId, content: written[finding.id].trim(), note: 'Written by the case manager in the assistant' };
        if (!action) continue;
        const res = await applyFindingAction(r, current, action, user, analyze, settings.journalTemplate);
        r = res.review; entries.push(...res.audit); applied++;
      }
      setProgress('Saving…');
      await persist(r, entries);
      setOpen(false);
      onDone(`${applied} fix(es) applied${confirmCds && readyCds.length ? ` and ${readyCds.length} CDS answer(s) confirmed` : ''}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false); setProgress('');
    }
  }

  if (!proposals.length && !readyCds.length) return null;

  if (!open) {
    return (
      <section className="flex flex-wrap items-center gap-4 border-[1.5px] border-navy-700 bg-white p-5">
        <Sparkles className="text-navy-700" size={28} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Let the assistant fix everything</h2>
          <p className="text-sm text-slate-600">It prepares a fix for all {proposals.length} open item(s). You review them on one page and approve once.</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="bg-navy-700 px-5 py-3 font-mono text-sm text-white hover:bg-navy-900">Prepare all fixes →</button>
      </section>
    );
  }

  return (
    <section className="border-[1.5px] border-navy-700 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-5">
        <Sparkles className="text-navy-700" size={22} aria-hidden="true" />
        <h2 className="flex-1 text-lg font-semibold">Assistant: proposed fixes</h2>
        <button type="button" onClick={() => setOpen(false)} className="font-mono text-xs text-slate-600 underline">Close</button>
      </div>

      {readyCds.length > 0 && (
        <label className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={confirmCds} onChange={(e) => setConfirmCds(e.target.checked)} />
          <span><b>Confirm {readyCds.length} CDS answer(s)</b> that have one clear answer in the journal.</span>
        </label>
      )}

      {GROUPS.map((g) => {
        const items = proposals.filter((p) => p.group === g.id);
        if (!items.length) return null;
        return (
          <div key={g.id} className="border-b border-slate-100">
            <div className="bg-slate-50 px-5 py-3">
              <p className="font-mono text-xs uppercase text-slate-500">{g.title} · {items.length}</p>
              <p className="text-sm text-slate-600">{g.help}</p>
            </div>
            {g.id === 'verify' && (
              <div className="px-5 pt-3">
                <label className="block text-xs font-medium text-slate-600" htmlFor="verify-note">Note saved with each item you tick</label>
                <input id="verify-note" value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm" />
              </div>
            )}
            <div className="divide-y divide-slate-100">
              {items.map(({ finding: f }) => (
                <div key={f.id} className="grid gap-2 px-5 py-3 md:grid-cols-[1fr_1.2fr] md:gap-6">
                  <div>
                    <p className="font-medium">{f.title}</p>
                    <p className="text-sm text-slate-600">{f.mismatch || f.suggestedCorrection}</p>
                  </div>
                  <div>
                    {g.id === 'auto' && (
                      <label className="flex items-start gap-3 text-sm">
                        <input type="checkbox" className="mt-0.5 h-5 w-5" checked={autoOn[f.id] !== false} onChange={(e) => setAutoOn((s) => ({ ...s, [f.id]: e.target.checked }))} />
                        <span>{f.options[0].label}</span>
                      </label>
                    )}
                    {g.id === 'choose' && (
                      <select aria-label={`Answer for ${f.title}`} value={choice[f.id] ?? ''} onChange={(e) => setChoice((s) => ({ ...s, [f.id]: e.target.value }))}
                        className={clsx('w-full border px-3 py-2 text-sm', choice[f.id] ? 'border-navy-700' : 'border-slate-300')}>
                        <option value="">Choose…</option>
                        {f.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    )}
                    {g.id === 'verify' && (
                      <label className="flex items-start gap-3 text-sm">
                        <input type="checkbox" className="mt-0.5 h-5 w-5" checked={!!verified[f.id]} onChange={(e) => setVerified((s) => ({ ...s, [f.id]: e.target.checked }))} />
                        <span>I checked this. <span className="text-slate-500">{f.suggestedCorrection}</span></span>
                      </label>
                    )}
                    {g.id === 'write' && (
                      f.journalFieldId ? (
                        <>
                          <textarea aria-label={`Journal text for ${f.title}`} rows={3} className="w-full border border-slate-300 px-3 py-2 text-sm"
                            value={written[f.id] ?? fieldText(f)} placeholder={f.suggestedCorrection}
                            onChange={(e) => setWritten((s) => ({ ...s, [f.id]: e.target.value }))} />
                          <p className="text-xs text-slate-500">Tip: {f.suggestedCorrection}</p>
                        </>
                      ) : <p className="text-sm text-slate-500">Fix this one on the Fix Documentation Issues tab.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3 p-5">
        <button type="button" disabled={busy || !total || !user} onClick={applyAll}
          className="bg-navy-700 px-5 py-3 font-mono text-sm text-white hover:bg-navy-900 disabled:opacity-40">
          Approve and apply {total} fix(es)
        </button>
        {busy && <span className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={15} className="animate-spin" /> {progress}</span>}
        {!busy && <span className="text-sm text-slate-500">Items you skip stay open. Every change is saved in the journal history and audit log.</span>}
        {error && <p className="w-full text-sm text-red-700">{error}</p>}
      </div>
    </section>
  );
}
