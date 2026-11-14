// The assistant's proposal for every open item, so the case manager only has to approve.
// Every proposal says where it came from:
//   'journal' — taken from what the journal says;
//   'guess'   — the journal is unclear, so this is the assistant's best guess (shown highlighted: check it);
//   'you'     — only the case manager can confirm it (a record check in WellSky). Off until ticked.
import type { CdsResponse } from '../engine/types.ts';
import type { ConsistencyFinding } from './types.ts';
import type { FindingAction } from './engine.ts';

export type Confidence = 'journal' | 'guess' | 'you';

export interface ProposalChoice { id: string; label: string; action: FindingAction | { type: 'cds'; value: string } }

export interface AiProposal {
  key: string;
  findingId?: string;
  cdsFieldId?: string;
  section: 'Journal' | 'CDS' | 'Records';
  title: string;
  problem: string;
  confidence: Confidence;
  reason: string;
  choices: ProposalChoice[];
  /** Index of the proposed choice, or -1 when nothing is proposed (records). */
  proposed: number;
}

const PLAIN_TITLE: Record<string, string> = {
  'journal_conflict:transfers': 'Transfers: journal says both "independent" and "needs help"',
  'journal_conflict:indoor_locomotion': 'Walking at home: journal says both "independent" and "needs help"',
  'classification:mobility_device': 'A walking device was seen, but the journal says "independent"',
  'classification:formal_informal': 'A family member is both an unpaid helper and a paid PCA',
  'classification:health_event': 'A recent health event vs. "no changes"',
  'journal_missing:qa_financial_consent': 'Financial Worksheet is not mentioned',
  'journal_missing:field_self_reported_health': '"Self-reported health" is blank',
  'journal_missing:qa_mls': 'Memory screening (MLS) line is missing',
};

function plainTitle(f: ConsistencyFinding) {
  if (PLAIN_TITLE[f.id]) return PLAIN_TITLE[f.id];
  return f.title.replace(/^Select verified answer:\s*/i, '').replace(/^QA \d+\.\s*/, '');
}

/** Pick the most likely option when the journal supports more than one. */
function bestOption(f: ConsistencyFinding, journal: string): number {
  const labels = f.options.map((o) => o.label);
  const find = (re: RegExp) => labels.findIndex((l) => re.test(l));
  if (f.kind === 'journal_conflict') { const i = find(/needs assistance/i); return i >= 0 ? i : 0; }
  if (/mls_reason/.test(f.id)) {
    const dementia = /\b(alzheimer|diagnosed with dementia|dementia diagnosis|cognitive impairment)\b/i.test(journal);
    const i = find(dementia ? /dementia is suspected/i : /not suspected/i); return i >= 0 ? i : 0;
  }
  const limited = find(/LIMITED ASSISTANCE/i);
  if (limited >= 0) return limited;
  const some = find(/SOME HELP/i);
  if (some >= 0) return some;
  return 0;
}

/** Journal sentences the assistant can write for items that need text, with alternatives. */
function textChoices(f: ConsistencyFinding, journal: string, current: string, date: string): { confidence: Confidence; reason: string; options: string[] } | null {
  const add = (s: string) => (current.trim() ? `${current.trim().replace(/[.\s]*$/, '.')} ${s}` : s);
  switch (f.id) {
    case 'classification:mobility_device': {
      const device = /scooter/i.test(f.journalInfo) ? 'scooter' : /wheelchair/i.test(f.journalInfo) ? 'wheelchair' : /cane/i.test(f.journalInfo) ? 'cane' : 'rolling walker';
      return { confidence: 'guess', reason: `The journal says a ${device} was seen during the visit.`, options: [
        add(`Consumer uses a ${device} indoors and outdoors.`), add(`Consumer uses a ${device} outdoors only.`), add(`Consumer uses a ${device} indoors only.`)] };
    }
    case 'classification:formal_informal':
      return { confidence: 'guess', reason: 'The journal lists the same family member as an informal support and as a PCA.', options: [
        add('The family member provides personal care during paid PCA hours (formal) and also helps without pay outside those hours (informal).'),
        add('All of the family member\'s help is given during paid PCA hours (formal).')] };
    case 'classification:health_event': {
      const event = journal.match(/recently undergone ([a-z ]+?surgery)/i)?.[1] ?? 'a procedure';
      return { confidence: 'guess', reason: `The journal mentions ${event} and also says "no changes".`, options: [
        add(`Consumer had ${event} as an outpatient, with no hospital stay. Needs did not change.`),
        add(`Consumer had ${event} as an outpatient, with no hospital stay. Needs changed and the care plan was updated.`)] };
    }
    case 'journal_missing:qa_financial_consent':
      return { confidence: 'guess', reason: 'Consent forms are documented, but the Financial Worksheet is not.', options: [
        `Financial Worksheet completed and reviewed with the consumer on ${date}.`] };
    case 'journal_missing:field_self_reported_health':
      return { confidence: 'guess', reason: 'This line was left blank.', options: [
        'Consumer rates their health as fair.', 'Consumer rates their health as good.', 'Consumer rates their health as poor.'] };
    case 'journal_missing:qa_mls': {
      const declined = /mini-?cog[^.]*declin|declin[^.]*mini-?cog/i.test(journal);
      return declined
        ? { confidence: 'journal', reason: 'The journal says the consumer declined the Mini-Cog.', options: [`MLS (Mini-Cog) offered on ${date}; consumer declined. Dementia is not suspected.`] }
        : { confidence: 'guess', reason: 'No memory screening is written in the journal.', options: [`MLS (Mini-Cog) completed on ${date}; no follow-up needed.`] };
    }
  }
  return null;
}

export function buildProposals(args: {
  findings: ConsistencyFinding[];
  cdsChecks: CdsResponse[];
  /** CDS items the journal only mentions; they must be verified in a record (e.g. eligibility). */
  recordCds?: CdsResponse[];
  journal: string;
  date: string;
  readField: (fieldId: string) => string;
}): AiProposal[] {
  const { findings, cdsChecks, recordCds = [], journal, date, readField } = args;
  const out: AiProposal[] = [];
  for (const f of findings) {
    const base = { key: f.id, findingId: f.id, title: plainTitle(f), problem: f.mismatch || f.suggestedCorrection };
    if (f.kind === 'record_verification') {
      out.push({ ...base, section: 'Records', confidence: 'you', reason: f.suggestedCorrection, proposed: -1,
        choices: [{ id: 'attest', label: 'I checked this in WellSky', action: { type: 'attest', text: `Verified in WellSky on ${new Date().toLocaleDateString()}` } }] });
      continue;
    }
    const isCds = f.kind === 'cds_unresolved' || f.kind === 'cds_contradiction';
    if (f.options.length) {
      const one = f.options.length === 1;
      out.push({ ...base, section: isCds ? 'CDS' : 'Journal', confidence: one ? 'journal' : 'guess',
        reason: one ? 'This is what the journal supports.' : 'The journal does not say which one. This is the most likely answer — check it.',
        proposed: one ? 0 : bestOption(f, journal),
        choices: f.options.map((o) => ({ id: o.id, label: o.label, action: { type: 'accept_option', optionId: o.id, note: 'Approved from the assistant' } })) });
      continue;
    }
    if (f.journalFieldId) {
      const t = textChoices(f, journal, readField(f.journalFieldId), date);
      if (t) {
        out.push({ ...base, section: 'Journal', confidence: t.confidence, reason: t.reason, proposed: 0,
          choices: t.options.map((text, i) => ({ id: `t${i}`, label: text, action: { type: 'provide_info', fieldId: f.journalFieldId!, content: text, note: 'Written by the assistant, approved by the case manager' } })) });
      }
    }
  }
  for (const c of cdsChecks) {
    const alts = c.choices.filter((x) => x !== c.suggestedResponse);
    out.push({ key: `cds:${c.fieldId}`, cdsFieldId: c.fieldId, section: 'CDS', title: `${c.code ? `${c.code} ` : ''}${c.label}`.slice(0, 120),
      problem: 'Not confirmed yet.', confidence: 'journal', reason: 'Taken from the journal.', proposed: 0,
      choices: [c.suggestedResponse, ...alts].map((v, i) => ({ id: `c${i}`, label: v, action: { type: 'cds', value: v } })) });
  }
  for (const c of recordCds) {
    const where = c.rationale.match(/verification against:\s*([^.]+)/i)?.[1] ?? 'the record in WellSky';
    out.push({ key: `cds:${c.fieldId}`, cdsFieldId: c.fieldId, section: 'Records', title: c.label, problem: 'The journal mentions it, but it has to be checked.',
      confidence: 'you', reason: `Check ${where}.`, proposed: -1,
      choices: [{ id: 'verified', label: 'Checked in WellSky — confirmed', action: { type: 'cds', value: `Verified in WellSky on ${new Date().toLocaleDateString()}` } }] });
  }
  const order = { Journal: 0, CDS: 1, Records: 2 } as const;
  return out.sort((a, b) => order[a.section] - order[b.section]);
}
