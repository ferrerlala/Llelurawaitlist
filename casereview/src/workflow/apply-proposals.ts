// Applies the proposals the case manager approved, in order, re-checking after each one,
// then fills the CDS from the final journal so both records match.
import { applyDecision } from '../data/review-actions.ts';
import type { AppUser, AuditEntry, OrgSettings, ReviewRecord } from '../data/types.ts';
import type { AiProposal } from './ai-proposals.ts';
import { applyFindingAction, matchCdsToJournal, type Analyzer, type CdsMatchSummary, type FindingAction } from './engine.ts';
import { runIndependentQa } from './independent-qa.ts';

export interface ApprovedItem { proposal: AiProposal; choice: number }

export async function applyProposals(
  review: ReviewRecord, items: ApprovedItem[], user: AppUser, analyze: Analyzer, settings: OrgSettings,
  onProgress?: (text: string) => void,
): Promise<{ review: ReviewRecord; audit: AuditEntry[]; applied: number; cds: CdsMatchSummary }> {
  let r = review;
  const entries: AuditEntry[] = [];
  let applied = 0;
  for (const { proposal: p, choice } of items) {
    const c = p.choices[choice];
    if (!c) continue;
    onProgress?.(p.title);
    if (c.action.type === 'cds') {
      if (!p.cdsFieldId || r.decisions[`cds:${p.cdsFieldId}`]) continue;
      const original = p.choices[0].label;
      const res = applyDecision(user, r, 'cds', p.cdsFieldId, { status: c.action.value === original ? 'approved' : 'edited', value: c.action.value, originalValue: original, note: 'Approved from the assistant' });
      r = res.review; entries.push(...res.audit); applied++;
      continue;
    }
    // Re-read the open findings: an earlier fix may already have resolved or reshaped this one.
    const current = runIndependentQa(r, settings).openFindings.find((f) => f.id === p.findingId);
    if (!current) continue;
    let action: FindingAction = c.action;
    if (action.type === 'accept_option') {
      const opt = current.options.find((o) => o.label === c.label);
      if (!opt) continue;
      action = { ...action, optionId: opt.id };
    }
    const res = await applyFindingAction(r, current, action, user, analyze, settings.journalTemplate);
    r = res.review; entries.push(...res.audit); applied++;
  }
  onProgress?.('Filling the CDS from the final journal');
  const m = matchCdsToJournal(r, user);
  return { review: m.review, audit: [...entries, ...m.audit], applied, cds: m.summary };
}
