// adl-iadl-comparator: compares every configured functional area between the
// narrative facts and the supplied CDS record. Silence is never treated as
// independence, and a mismatch is only reported for genuinely conflicting levels.

import { functionalFactKey, type FunctionalAreaDef } from '@shared/fact-catalog.ts';
import { findAreas } from './clinical-data-extractor.ts';
import { evidenceOf, type FactIndex } from './facts.ts';
import type {
  AdlComparisonRow, CdsFunctionalStatus, CdsRecordEntry, ComparisonResult, NarrativeFunctionalStatus, SourceDocument,
} from './types.ts';

/** Parse "Label: Value" lines from CDS Record documents. */
export function parseCdsRecords(docs: SourceDocument[]): CdsRecordEntry[] | null {
  const cdsDocs = docs.filter((d) => d.type === 'CDS Record');
  if (!cdsDocs.length) return null;
  const entries: CdsRecordEntry[] = [];
  for (const d of cdsDocs) {
    d.text.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.replace(/^\s*(?:[*•\-–]|\d+[.)])\s+/, '').trim();
      const m = line.match(/^([^:|]{2,80})\s*[:|]\s*(.+)$/) ?? line.match(/^(.{2,80}?)\s+[–-]\s+(.+)$/);
      if (m) entries.push({ label: m[1].trim(), value: m[2].trim().replace(/\.$/, ''), line: i + 1, docId: d.id, docName: d.name });
    });
  }
  return entries;
}

export function normalizeCdsFunctional(value: string): CdsFunctionalStatus {
  const v = value.toLowerCase().trim();
  if (/^(n\/?a|not applicable)\b/.test(v)) return 'Not Applicable';
  if (/did not occur/.test(v)) return 'Other';
  if ((/\bdependen(t|ce)\b|total(ly)? (assist|dependent)|^total\b|\bby others\b/.test(v)) && !/\bindependent\b/.test(v)) return 'Dependent';
  // Check independence first: CDS code 0 reads "INDEPENDENT-No help, setup or oversight".
  if (/\bindependent\b/.test(v) && !/\bnot independent\b/.test(v)) return 'Independent';
  if (/\b(assist|assistance|help|supervision|oversight|cue|cueing|limited|extensive|maximal|needs|requires|set ?up)\b/.test(v)) return 'Needs Assistance';
  if (/\b(independent|indep|no assistance|self)\b/.test(v) || /^i$/.test(v)) return 'Independent';
  if (!v || /^(blank|not answered|unknown|-)$/.test(v)) return 'Not Recorded';
  return 'Other';
}

export function cdsEntryForArea(area: FunctionalAreaDef, entries: CdsRecordEntry[]): CdsRecordEntry | undefined {
  return entries.find((e) => findAreas(e.label, [area]).length > 0);
}

const RANK: Record<string, number> = {
  Dependent: 5, 'Needs Assistance': 4, Independent: 3, 'Assistance Provided': 2, 'Mentioned - Level Not Stated': 1,
};

export function narrativeStatusFor(areaId: string, facts: FactIndex): { status: NarrativeFunctionalStatus; detail: string } {
  const list = facts.get(functionalFactKey(areaId));
  if (!list.length) return { status: 'Not Documented', detail: 'No statement about this activity in the submitted documentation.' };
  const values = new Set(list.map((f) => f.value));
  const hasIndep = values.has('Independent');
  const hasHelp = values.has('Needs Assistance') || values.has('Dependent') || values.has('Assistance Provided');
  if (hasIndep && hasHelp) return { status: 'Conflicting', detail: `Conflicting statements: ${[...values].join(' vs. ')}` };
  const best = [...values].sort((a, b) => (RANK[b] ?? 0) - (RANK[a] ?? 0))[0] as NarrativeFunctionalStatus;
  const details = list.map((f) => f.detail).filter(Boolean);
  return { status: best, detail: details.join('; ') };
}

type NCat = 'indep' | 'assist' | 'partial' | 'conflict' | 'none';
type CCat = 'indep' | 'assist' | 'na' | 'other' | 'none' | 'not_supplied';

function nCat(s: NarrativeFunctionalStatus): NCat {
  switch (s) {
    case 'Independent': return 'indep';
    case 'Needs Assistance': case 'Dependent': return 'assist';
    case 'Assistance Provided': case 'Mentioned - Level Not Stated': return 'partial';
    case 'Conflicting': return 'conflict';
    default: return 'none';
  }
}
function cCat(s: CdsFunctionalStatus): CCat {
  switch (s) {
    case 'Independent': return 'indep';
    case 'Needs Assistance': case 'Dependent': return 'assist';
    case 'Not Applicable': return 'na';
    case 'Other': return 'other';
    case 'CDS Not Supplied': return 'not_supplied';
    default: return 'none';
  }
}

export function compareArea(n: NarrativeFunctionalStatus, c: CdsFunctionalStatus): { result: ComparisonResult; explanation: string } {
  const nc = nCat(n);
  const cc = cCat(c);
  if (cc === 'not_supplied') {
    if (nc === 'none') return { result: 'Missing in Narrative', explanation: 'Not documented in the narrative and no CDS record was supplied. Assess and document; do not assume independence.' };
    if (nc === 'conflict') return { result: 'Needs Verification', explanation: 'The narrative contains conflicting statements. Resolve with the consumer and correct the documentation.' };
    if (nc === 'partial') return { result: 'Needs Verification', explanation: 'The narrative references this activity but does not state the level of assistance. No CDS record supplied to compare.' };
    return { result: 'Needs Verification', explanation: 'Narrative status found. No CDS record supplied — compare against the CDS in WellSky before entry.' };
  }
  if (cc === 'na' && (nc === 'none' || nc === 'partial')) return { result: 'Not Applicable', explanation: 'CDS records Not Applicable. Confirm this is appropriate.' };
  if (nc === 'none' && cc === 'none') return { result: 'Missing in Narrative', explanation: 'Not documented in the narrative and not recorded in the supplied CDS record.' };
  if (nc === 'none') return { result: 'Needs Verification', explanation: 'CDS has a response but the narrative does not describe this activity. Verify and document; not a mismatch unless the narrative conflicts.' };
  if (cc === 'none') return { result: 'Missing in CDS', explanation: 'Narrative documents this activity but the supplied CDS record has no response.' };
  if (nc === 'conflict') return { result: 'Needs Verification', explanation: 'The narrative contains conflicting statements about this activity.' };
  if (nc === 'indep' && cc === 'indep') return { result: 'Match', explanation: 'Narrative and CDS both document independence.' };
  if (nc === 'assist' && cc === 'assist') {
    if (n === c) return { result: 'Match', explanation: 'Narrative and CDS document the same level of assistance.' };
    return { result: 'Needs Verification', explanation: `Both document assistance but at different levels (narrative: ${n}; CDS: ${c}).` };
  }
  if ((nc === 'indep' && cc === 'assist') || (nc === 'assist' && cc === 'indep')) {
    return { result: 'Mismatch', explanation: `Conflict: narrative documents "${n}" but CDS records "${c}".` };
  }
  if (nc === 'partial' && cc === 'indep' && n === 'Assistance Provided') {
    return { result: 'Needs Verification', explanation: 'Narrative states someone assists with this activity while the CDS records Independent. Possible conflict — verify.' };
  }
  return { result: 'Needs Verification', explanation: 'Narrative does not state a clear level that can be compared with the CDS response.' };
}

export function compareAdlIadl(areas: FunctionalAreaDef[], facts: FactIndex, cdsRecord: CdsRecordEntry[] | null, docs: SourceDocument[]): AdlComparisonRow[] {
  return areas.map((area) => {
    const { status, detail } = narrativeStatusFor(area.id, facts);
    const entry = cdsRecord ? cdsEntryForArea(area, cdsRecord) : undefined;
    const cdsStatus: CdsFunctionalStatus = !cdsRecord ? 'CDS Not Supplied' : entry ? normalizeCdsFunctional(entry.value) : 'Not Recorded';
    const { result, explanation } = compareArea(status, cdsStatus);
    const evidence = facts.get(functionalFactKey(area.id)).map(evidenceOf);
    if (entry) {
      const doc = docs.find((d) => d.id === entry.docId);
      evidence.push({
        text: `${entry.label}: ${entry.value}`,
        location: doc ? { docId: doc.id, docName: doc.name, docType: doc.type, line: entry.line, section: null } : null,
      });
    }
    return {
      areaId: area.id, label: area.label, type: area.type, narrativeStatus: status, narrativeDetail: detail,
      cdsStatus, cdsRawValue: entry?.value ?? null, result, explanation, evidence,
    };
  });
}

