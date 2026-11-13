// clinical-data-extractor (rule-based provider).
//
// Deterministic Stage A extraction used in MOCK AI MODE and as an offline
// fallback. It recognizes common case-management phrasing only; it never
// infers. Anything it does not recognize simply produces no fact, which the
// validation stage then reports as "Not Documented".

import type { Assertion, Confidence, RawExtraction, RawFact, SourceDocument } from '@shared/extraction-contract.ts';
import { DEFAULT_FUNCTIONAL_AREAS, functionalFactKey, type FunctionalAreaDef, type FunctionalStatusValue } from '@shared/fact-catalog.ts';
import { segmentDocument, type Sentence } from './assessment-parser.ts';

type Emit = (key: string, value: string, opts?: { detail?: string; assertion?: Assertion; confidence?: Confidence; sourceText?: string }) => void;

const NEGATED = /^(no|none|denies|denied|not)\b|\bno (recent |new |additional |reported )?\b/i;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findAreas(segment: string, areas: FunctionalAreaDef[]): FunctionalAreaDef[] {
  const text = segment.toLowerCase();
  const hits: FunctionalAreaDef[] = [];
  for (const a of areas) {
    if (a.synonyms.some((s) => new RegExp(`(^|[^a-z])${escapeRe(s)}([^a-z]|$)`).test(text))) hits.push(a);
  }
  // "continence" is a synonym of incontinence management; avoid double hits from "incontinence".
  return hits;
}

/** label: value lines, e.g. "Copay: $0" or "Risk level: Risk 3, FIL 1C". */
function labelValue(text: string, label: RegExp): string | null {
  const m = text.match(new RegExp(`^(?:${label.source})\\s*[:\\-–]\\s*(.+)$`, 'i'));
  return m ? m[1].trim().replace(/\.$/, '') : null;
}

const MONEY = /\$\s?[\d,]+(?:\.\d{2})?/;
const DATE = /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(?:\d{1,2},?\s+)?\d{4})\b/i;

function responsibleFrom(subject: string): string {
  const s = subject.toLowerCase();
  if (/\b(cm|case manager|care manager)\b/.test(s)) return 'Case Manager';
  if (/\brn\b|nurse/.test(s)) return 'RN';
  if (/consumer|elder|client/.test(s)) return 'Consumer';
  if (/family|daughter|son|spouse|niece|nephew/.test(s)) return 'Family';
  if (/supervisor/.test(s)) return 'Supervisor';
  return subject.trim();
}

function extractFunctional(s: Sentence, areas: FunctionalAreaDef[], emit: Emit): boolean {
  const t = s.text;
  let matched = false;
  const add = (segment: string, value: FunctionalStatusValue, detail = '', confidence: Confidence = 'high') => {
    for (const a of findAreas(segment, areas)) {
      emit(functionalFactKey(a.id), value, { detail, confidence });
      matched = true;
    }
  };
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\b(not\s+)?independent(?:ly)?\s+(?:with|in|for)\s+(.+)$/i))) {
    add(m[2], m[1] ? 'Needs Assistance' : 'Independent', m[1] ? 'Documented as not independent; level not specified' : '');
  }
  if ((m = t.match(/\b(?:requires|needs|require|need)\s+(?:some\s+|minimal\s+|moderate\s+|maximum\s+|total\s+)?(?:assistance|assist|help|support|hands-on assistance|cueing|supervision)\s+(?:with|for)\s+(.+)$/i))) {
    add(m[1], 'Needs Assistance');
  }
  if ((m = t.match(/\bdependent\s+(?:for|with|in|on others for)\s+(.+)$/i))) add(m[1], 'Dependent');
  if ((m = t.match(/^(.+?)\s+(?:assists?|helps?)\s+(?:the consumer\s+|consumer\s+|elder\s+)?with\s+(.+)$/i))) {
    if (!/independent/i.test(m[1])) add(m[2], 'Assistance Provided', `Provided by: ${m[1].trim()}`);
  }
  if (!matched && (m = t.match(/^(.+?)\s+(?:provides?|performs?|completes?|does)\s+(?:the\s+)?(.+)$/i))) {
    add(m[2], 'Assistance Provided', `Provided by: ${m[1].trim()}`);
  }
  if (!matched) {
    // Referenced without a level — evidence for verification only.
    for (const a of findAreas(t, areas)) {
      emit(functionalFactKey(a.id), 'Mentioned - Level Not Stated', { confidence: 'low' });
      matched = true;
    }
  }
  return matched;
}

function extractSentence(s: Sentence, areas: FunctionalAreaDef[], emit: Emit) {
  const t = s.text;
  const lower = t.toLowerCase();
  let v: string | null;
  let m: RegExpMatchArray | null;

  // ---------- Basic ----------
  if ((v = labelValue(t, /assessment date|date of (?:assessment|visit)|visit date/))) emit('basic.assessment_date', v);
  if ((v = labelValue(t, /location|assessment location/))) emit('basic.location', v);
  else if ((m = t.match(/\b(?:assessment|visit)\s+(?:was\s+)?(?:held|completed|conducted)\s+(?:at|in)\s+(.+?)\.?$/i))) emit('basic.location', m[1]);
  if ((v = labelValue(t, /home environment/))) emit('basic.home_environment', v);
  if ((v = labelValue(t, /people present|present|in attendance/))) emit('basic.people_present', v);
  if ((v = labelValue(t, /observations?/))) emit('basic.observations', v);
  if ((m = t.match(/\b(\d{2,3})[- ]year[- ]old\b/i))) emit('basic.age', m[1]);
  if ((m = t.match(/\b(single|married|widowed|divorced|separated)\b/i)) && /consumer|elder|client|year-old/i.test(t)) emit('basic.marital_status', cap(m[1]));
  if ((m = t.match(/\b(female|male|woman|man)\b/i)) && /year-old|consumer|elder/i.test(t)) emit('basic.gender', /^(female|woman)$/i.test(m[1]) ? 'Female' : 'Male');
  if ((m = t.match(/\blives\s+(alone|with\s+.+?)(?:[.,;]|$)/i))) emit('basic.living_arrangement', `Lives ${m[1]}`);

  // ---------- Medical ----------
  if (/\balert and oriented\b|\boriented x ?\d/i.test(t)) emit('medical.cognitive_status', t.replace(/\.$/, ''));
  if ((m = t.match(/\b(mini-?cog|moca|mmse|slums|memory screen(?:ing)?|cognitive screen(?:ing)?)\b/i))) {
    const tool = m[1];
    if (/\b(declined|refused)\b/i.test(t)) emit('medical.memory_screening', `${tool} not completed - consumer declined`, { assertion: 'declined' });
    else if (/\bnot (completed|done|administered)\b/i.test(t)) emit('medical.memory_screening', `${tool} not completed`, { assertion: 'not_completed' });
    else if ((m = t.match(/\bscore[d]?\s*(?:of|:)?\s*(\d+(?:\/\d+)?)/i))) emit('medical.memory_screening', `${tool} completed, score ${m[1]}`);
    else emit('medical.memory_screening', t.replace(/\.$/, ''), { assertion: 'uncertain', confidence: 'low' });
  }
  if ((v = labelValue(t, /medical conditions?|diagnos[ie]s|medical history|conditions/))) {
    for (const c of splitList(v)) emit('medical.conditions', c);
  }
  if (/\bmedications? (?:were |was )?reviewed\b/i.test(t)) emit('medical.medication_review', t.replace(/\.$/, ''));
  if ((m = t.match(/\blast pcp (?:appointment|visit)\s+(?:was\s+)?(?:in\s+|on\s+)?(.+?)\.?$/i))) emit('medical.pcp_last_visit', m[1]);
  if (/\b(wants|would like|requests?|requested|looking for)\b.*\bnew pcp\b/i.test(t)) emit('medical.pcp_change_request', t.replace(/\.$/, ''));
  if ((v = labelValue(t, /pcp|primary care(?: physician| provider)?/))) emit('medical.pcp_info', v);
  if (/hospitali[sz]/i.test(t)) {
    emit('medical.hospitalizations', t.replace(/\.$/, ''), { assertion: NEGATED.test(t) ? 'reported_absent' : 'affirmed' });
  }
  if (/\bfalls?\b|\bfell\b/i.test(t) && !/fall risk/i.test(t)) {
    emit('medical.falls', t.replace(/\.$/, ''), { assertion: NEGATED.test(t) ? 'reported_absent' : 'affirmed' });
  }
  if (/\bchanges? in (?:medical condition|health)/i.test(t)) {
    emit('medical.health_status_change', t.replace(/\.$/, ''), { assertion: NEGATED.test(t) ? 'reported_absent' : 'affirmed' });
  }
  if (/\bchanges? in .*(formal services|informal supports)/i.test(t)) {
    emit('services.changes', t.replace(/\.$/, ''), { assertion: NEGATED.test(t) ? 'reported_absent' : 'affirmed' });
  }

  // ---------- Services ----------
  if ((v = labelValue(t, /current services|services/))) emit('services.current', v);
  if ((m = t.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:\/\s*week\s*|per week\s*|weekly\s*|of\s*)?(?:hha|home health aide)\b/i))) emit('services.hha_hours', `${m[1]} hours HHA`);
  if (/\bPERS\b/.test(t)) emit('services.pers', /\bno pers\b/i.test(t) ? 'No PERS' : 'PERS in place', { assertion: /\bno pers\b/i.test(t) ? 'reported_absent' : 'affirmed' });
  if (/\bpersonal care\b/i.test(t)) emit('services.personal_care', t.replace(/\.$/, ''));
  if (/\brn services?\b/i.test(t)) emit('services.rn', t.replace(/\.$/, ''));
  if (/\b(PT|OT)\b/.test(t) || /physical therapy|occupational therapy/i.test(t)) {
    const prov = t.match(/^(.+?)\s+provides?\b/i)?.[1];
    emit('services.pt_ot', t.replace(/\.$/, ''), { detail: prov ? `Provider: ${prov}` : '' });
    if (prov) emit('services.vendors', prov);
  }
  if ((m = t.match(/\bmay provide\s+(.+?)\s+in the future\b/i))) emit('services.future_services', m[1], { assertion: 'uncertain', confidence: 'medium' });
  if (/\bhomemak/i.test(t)) emit('services.homemaking', t.replace(/\.$/, ''));
  if ((m = t.match(/^(.+?)\s+provides?\s+transportation\b/i))) {
    emit('services.transportation', t.replace(/\.$/, ''), { detail: `Provider: ${m[1]}` });
    emit('services.vendors', m[1]);
  }
  if (/\bmeals?\b/i.test(t) && /(assist|provide|deliver|frozen|meals on wheels)/i.test(t)) emit('services.meals', t.replace(/\.$/, ''));
  if (/\bsatisfied\b|\bsatisfaction\b/i.test(t)) emit('services.satisfaction', t.replace(/\.$/, ''), { assertion: /\b(not|dis)satisfied\b/i.test(t) ? 'affirmed' : 'affirmed' });
  if (/\badditional service needs?\b/i.test(t)) emit('services.additional_needs', t.replace(/\.$/, ''), { assertion: NEGATED.test(t) ? 'reported_absent' : 'affirmed' });
  if ((m = t.match(/^(family|daughter|son|spouse|friends?|neighbou?rs?|niece|nephew|sister|brother)\b.*\b(provides?|assists?|helps?|visits?)\b/i))) emit('services.informal_supports', t.replace(/\.$/, ''), { detail: cap(m[1]) });

  // ---------- Functional ----------
  extractFunctional(s, areas, emit);

  // ---------- Needs / goals ----------
  if ((v = labelValue(t, /main identified need|identified needs?|needs identified/))) emit('goals.identified_needs', v);
  if (/person-centered goals?|\bgoals?\b/i.test(t) && !/^\s*$/.test(t)) {
    if (/\bno new\b.*\bgoals?\b/i.test(t)) emit('goals.new', 'No new person-centered goals reported', { assertion: 'reported_absent' });
    else if ((v = labelValue(t, /new goals?|goals?|consumer goals?|person-centered goals?/))) emit('goals.new', v);
  }

  // ---------- Eligibility / financial ----------
  if (/\b(continues to |does not |no longer )?meets?\b.*\beligibility\b/i.test(t)) {
    const neg = /\b(does not|no longer)\b/i.test(t);
    const val = neg ? 'Narrative states eligibility NOT met' : 'Narrative states eligibility met (not independently verified)';
    if (/\bage\b/i.test(t)) emit('eligibility.age', val);
    if (/\bneed\b/i.test(t)) emit('eligibility.need', val);
    if (/\bfil\b/i.test(t)) emit('eligibility.fil', val);
  }
  if ((v = labelValue(t, /annual income|income/)) && MONEY.test(v)) emit('financial.annual_income', v.match(MONEY)![0].replace(/\s/g, ''));
  if ((v = labelValue(t, /copay(?: amount)?|co-pay(?: amount)?|monthly copay/)) && MONEY.test(v)) emit('financial.copay', v.match(MONEY)![0].replace(/\s/g, ''));
  else if ((m = t.match(/\bcopay\s+(?:of|is|was)\s+(\$\s?[\d,]+(?:\.\d{2})?)/i))) emit('financial.copay', m[1].replace(/\s/g, ''));
  if ((v = labelValue(t, /overdue balance|balance due|past due balance/)) && MONEY.test(v)) emit('financial.overdue_balance', v.match(MONEY)![0].replace(/\s/g, ''));
  if ((v = labelValue(t, /masshealth(?: status)?/))) emit('financial.masshealth', v, { assertion: /^none$/i.test(v) ? 'reported_absent' : 'affirmed' });
  if (/financial worksheet/i.test(t)) emit('financial.worksheet', t.replace(/\.$/, ''), { assertion: /\bnot\b/i.test(t) ? 'not_completed' : 'affirmed' });
  if (/^application\b.*\b(completed|signed|submitted)\b/i.test(t)) emit('financial.application', t.replace(/\.$/, ''));

  // ---------- Consent ----------
  const signedDate = t.match(DATE)?.[0];
  if (/applicant consent(?: and| &) disclosure/i.test(t)) emit('consent.applicant_consent', t.replace(/\.$/, ''), { detail: signedDate ? `Date: ${signedDate}` : '', assertion: /\bnot\b/i.test(t) ? 'not_completed' : 'affirmed' });
  if (/permission to contact emergency services/i.test(t)) emit('consent.emergency_services_permission', t.replace(/\.$/, ''), { detail: signedDate ? `Date: ${signedDate}` : '', assertion: /\bnot\b/i.test(t) ? 'not_completed' : 'affirmed' });
  if (/privacy practices|hipaa/i.test(t)) emit('consent.hipaa', t.replace(/\.$/, ''));
  if (/public benefits/i.test(t)) emit('consent.public_benefits', t.replace(/\.$/, ''));

  // ---------- Risk ----------
  if ((v = labelValue(t, /risk level|risk/))) {
    const lvl = v.match(/risk\s*(\d)/i) ?? v.match(/^(\d)\b/);
    if (lvl) emit('risk.level', `Risk ${lvl[1]}`);
    const fil = v.match(/\bFIL\s*([0-9][A-Z]?)\b/i);
    if (fil) emit('risk.fil_code', fil[1].toUpperCase());
  } else {
    const lvl = t.match(/\brisk level\s*(?:of|is|:)?\s*(?:risk\s*)?(\d)\b/i);
    if (lvl) emit('risk.level', `Risk ${lvl[1]}`);
  }
  if ((v = labelValue(t, /fil|fil code|functional impairment level/))) {
    const fil = v.match(/\b([0-9][A-Z]?)\b/i);
    if (fil) emit('risk.fil_code', fil[1].toUpperCase());
  }
  if (/\brisk factors?\b/i.test(t)) emit('risk.factors_change', t.replace(/\.$/, ''), { assertion: NEGATED.test(t) ? 'reported_absent' : 'affirmed' });
  if (/risk worksheet/i.test(t)) emit('risk.worksheet', t.replace(/\.$/, ''), { detail: signedDate ? `Date: ${signedDate}` : '' });

  // ---------- Follow-up ----------
  if ((m = t.match(/^(cm|case manager|care manager|rn|nurse|consumer|elder|family|daughter|son|supervisor)\s+will\s+(.+?)\.?$/i))) {
    const due = m[2].match(/\b(?:by|on|before|no later than)\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]+\.? \d{1,2},? \d{4})/);
    emit('followup.action', cap(m[2]), { detail: `Responsible: ${responsibleFrom(m[1])}${due ? `; Due: ${due[1]}` : ''}`, assertion: 'planned' });
  } else if ((m = t.match(/^(?:follow[- ]up|plan|next steps?)\s*:\s*(.+?)\.?$/i))) {
    emit('followup.action', cap(m[1]), { detail: 'Responsible: Not documented', assertion: 'planned' });
  }
  if ((v = labelValue(t, /next assessment(?: date)?|next (?:visit|reassessment)(?: due)?/))) emit('followup.next_assessment', v, { assertion: 'planned' });
  if ((m = t.match(/\b(?:idc|interdisciplinary conference|interdisciplinary team conference)\b\s*(?:held\s+)?(?:with\s+)?(.*)$/i))) {
    const participants = m[1].replace(/^[:\-–\s]+/, '').replace(/\.$/, '');
    emit('followup.idc', participants || t);
  }
  if (/\breferr(?:al|ed)\b/i.test(t)) emit('followup.referrals', t.replace(/\.$/, ''));

  // ---------- Contacts ----------
  if (/emergency contacts?/i.test(t) && /reviewed|updated|no changes|changed/i.test(t)) emit('contacts.emergency_contacts', t.replace(/\.$/, ''));
  if ((v = labelValue(t, /primary emergency contact|emergency contact/))) emit('contacts.primary_emergency_contact', v);
  if ((v = labelValue(t, /alternate emergency contact|secondary emergency contact/))) emit('contacts.alternate_emergency_contact', v);
  if ((v = labelValue(t, /health ?care proxy|hcp/))) emit('contacts.health_care_proxy', v);

  // ---------- MLS, visits, suspension, program ----------
  if (/\bMLS\b/.test(t)) emit('mls.status', t.replace(/\.$/, ''), { assertion: /\bnot\b/i.test(t) ? 'not_completed' : 'affirmed' });
  if (/\b(RD|RA|redetermination|reassessment)\b/.test(t) && /\b(visit|completed|due|attempt)/i.test(t)) emit('visits.rd_ra', t.replace(/\.$/, ''));
  if (/\battempt(?:s|ed)?\b/i.test(t) && /\b(visit|call|contact)/i.test(t)) emit('visits.attempts', t.replace(/\.$/, ''));
  if (/\bsuspen(?:d|sion|ded)\b/i.test(t)) emit('suspension.info', t.replace(/\.$/, ''));
  if ((v = labelValue(t, /program|program type/))) emit('program.type', v);
  if (/\bwaiver\b/i.test(t)) emit('program.waiver', t.replace(/\.$/, ''));
  void lower;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function splitList(v: string): string[] {
  // Split on commas/semicolons but keep the separators so merged items read as written.
  const pieces = v.replace(/\.$/, '').split(/(,\s*(?:and\s+)?|;\s*)/i);
  const out: string[] = [];
  for (let i = 0; i < pieces.length; i += 2) {
    const p = pieces[i].trim();
    const sep = i > 0 ? pieces[i - 1] : '';
    if (!p) continue;
    const prev = out[out.length - 1];
    // Keep "history of fractured foot, legs, and hips" together.
    if (prev && /^(history of|hx of|s\/p)\b/i.test(prev) && p.split(/\s+/).length <= 2 && !/^(history|hx)\b/i.test(p)) {
      out[out.length - 1] = `${prev}${sep.replace(/\s+$/, ' ')}${p}`;
    } else out.push(p);
  }
  return out;
}

/** Rule-based extraction over every document (CDS Record facts are used for cross-document checks only). */
export function extractWithRules(docs: SourceDocument[], areas: FunctionalAreaDef[] = DEFAULT_FUNCTIONAL_AREAS): RawExtraction {
  const facts: RawFact[] = [];
  const seen = new Set<string>();
  for (const doc of docs) {
    for (const s of segmentDocument(doc)) {
      const emit: Emit = (key, value, opts = {}) => {
        const fact: RawFact = {
          key,
          docId: doc.id,
          value: value.trim(),
          detail: opts.detail ?? '',
          assertion: opts.assertion ?? 'affirmed',
          sourceText: opts.sourceText ?? s.text,
          confidence: opts.confidence ?? 'high',
        };
        const sig = `${doc.id}|${key}|${fact.value.toLowerCase()}|${fact.sourceText}`;
        if (seen.has(sig) || !fact.value) return;
        seen.add(sig);
        facts.push(fact);
      };
      extractSentence(s, areas, emit);
    }
  }
  return { facts, injectionWarnings: [] };
}
