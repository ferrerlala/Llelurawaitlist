// clinical-data-extractor (rule-based provider).
//
// Deterministic Stage A extraction used in MOCK AI MODE and as an offline
// fallback. It recognizes common case-management phrasing and agency note
// templates ("Label: value" fields). It never infers: anything it does not
// recognize produces no fact, which validation reports as "Not Documented".

import type { Assertion, Confidence, RawExtraction, RawFact, SourceDocument } from '@shared/extraction-contract.ts';
import { DEFAULT_FUNCTIONAL_AREAS, functionalFactKey, type FunctionalAreaDef, type FunctionalStatusValue } from '@shared/fact-catalog.ts';
import { parseDocument, type Sentence } from './assessment-parser.ts';

type EmitOpts = { detail?: string; assertion?: Assertion; confidence?: Confidence; sourceText?: string };
type Emit = (key: string, value: string, opts?: EmitOpts) => void;

/** Statement that something is absent / did not happen. */
const NEGATED = /^(no|none|denies|denied|not)\b|\b(no|none|not|denies|denied|did not|does not|has not|without)\b/i;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Expand "indoor/outdoor mobility" into "indoor mobility, outdoor mobility" before matching. */
function expandSlashPairs(text: string): string {
  return text.replace(/\b([a-z]+)\/([a-z]+)\s+(mobility|locomotion|ambulation)\b/gi, '$1 $3, $2 $3');
}

export function findAreas(segment: string, areas: FunctionalAreaDef[]): FunctionalAreaDef[] {
  const text = expandSlashPairs(segment.toLowerCase());
  return areas.filter((a) => a.synonyms.some((s) => new RegExp(`(^|[^a-z])${escapeRe(s)}([^a-z]|$)`).test(text)));
}

const MONEY = /\$\s?[\d,]+(?:\.\d{2})?/;
const DATE = /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(?:\d{1,2},?\s+)?\d{4})\b/i;
const money = (s: string) => s.match(MONEY)?.[0].replace(/\s/g, '') ?? null;
const clean = (s: string) => s.trim().replace(/[.;]+$/, '').trim();

function responsibleFrom(subject: string): string {
  const s = subject.toLowerCase();
  if (/\b(cm|case manager|care manager)\b/.test(s)) return 'Case Manager';
  if (/\brn\b|nurse/.test(s)) return 'RN';
  if (/consumer|elder|client/.test(s)) return 'Consumer';
  if (/family|daughter|son|spouse|niece|nephew/.test(s)) return 'Family';
  if (/supervisor/.test(s)) return 'Supervisor';
  return subject.trim();
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function splitList(v: string): string[] {
  // Split on commas/semicolons but keep the separators so merged items read as written.
  const pieces = v.replace(/\.$/, '').split(/(,\s*(?:and\s+)?|;\s*)/i);
  const out: string[] = [];
  for (let i = 0; i < pieces.length; i += 2) {
    const p = pieces[i].trim().replace(/^and\s+/i, '');
    const sep = i > 0 ? pieces[i - 1] : '';
    if (!p) continue;
    const prev = out[out.length - 1];
    // Keep "history of fractured foot, legs, and hips" together (single lower-case body parts only).
    if (prev && /^(history of|hx of|s\/p)\b/i.test(prev) && /^[a-z]+$/.test(p)) {
      out[out.length - 1] = `${prev}${sep.replace(/\s+$/, ' ')}${p}`;
    } else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Functional status
// ---------------------------------------------------------------------------
function extractFunctional(text: string, areas: FunctionalAreaDef[], emit: Emit): boolean {
  let matched = false;
  const add = (segment: string, value: FunctionalStatusValue, detail = '', confidence: Confidence = 'high') => {
    for (const a of findAreas(segment, areas)) {
      emit(functionalFactKey(a.id), value, { detail, confidence });
      matched = true;
    }
  };
  const t = text;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\b(not\s+)?independen(?:t|ce|tly)\s+(?:with|in|for)\s+(.+)$/i))) {
    add(m[2], m[1] ? 'Needs Assistance' : 'Independent', m[1] ? 'Documented as not independent; level not specified' : '');
  }
  if ((m = t.match(/\b(?:requires|needs|require|need|receives|receiving)\s+(?:some\s+|minimal\s+|moderate\s+|maximum\s+|total\s+)?(?:assistance|assist|help|support|hands-on assistance|cueing|supervision)\s+(?:with|for)\s+(.+)$/i))) {
    add(m[1], 'Needs Assistance');
  }
  if ((m = t.match(/\b(?:assistance|help|support)\s+(?:is|are)\s+(?:provided|given|needed|required)\s+(?:with|for)\s+(.+)$/i))) {
    add(m[1], 'Needs Assistance', 'Assistance provided; level not specified');
  }
  if ((m = t.match(/\bdependent\s+(?:for|with|in|on others for)\s+(.+)$/i))) add(m[1], 'Dependent');
  if (!matched && (m = t.match(/^(.+?)\s+(?:assists?|helps?)\s+(?:the consumer\s+|consumer\s+|elder\s+)?with\s+(.+)$/i))) {
    if (!/independen/i.test(m[1])) add(m[2], 'Assistance Provided', `Provided by: ${m[1].trim()}`);
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

// ---------------------------------------------------------------------------
// Template field labels (first sentence of a "Label: value" line)
// ---------------------------------------------------------------------------
type LabelRule = { label: RegExp; run: (body: string, emit: Emit, s: Sentence) => void };

const LABEL_RULES: LabelRule[] = [
  { label: /^(assessment|visit) date$|^date of (assessment|visit)$|^date$/i, run: (b, e) => e('basic.assessment_date', b) },
  { label: /^(assessment )?location( of (assessment|visit))?$/i, run: (b, e) => e('basic.location', b) },
  { label: /^home environment/i, run: (b, e) => e('basic.home_environment', b) },
  { label: /^people present|^present( at)?|^in attendance/i, run: (b, e) => e('basic.people_present', b) },
  { label: /^observations?/i, run: (b, e) => e('basic.observations', b) },
  { label: /^(current program|current services|services|formal supports?|current program and service plan)\b/i, run: (b, e) => e('services.current', b) },
  { label: /^informal supports?/i, run: (b, e) => e('services.informal_supports', b) },
  { label: /^(main )?identified needs?|^needs identified/i, run: (b, e) => e('goals.identified_needs', b) },
  { label: /^(medical conditions?|diagnos[ie]s|medical history)$/i, run: (b, e) => splitList(b).forEach((c) => e('medical.conditions', c)) },
  { label: /^(annual )?(combined )?income/i, run: (b, e) => { const v = money(b); if (v) e('financial.annual_income', v); } },
  { label: /^(monthly )?co-?pay/i, run: (b, e) => { const v = money(b); if (v) e('financial.copay', v); } },
  { label: /^(overdue|past due) balance|^balance due/i, run: (b, e) => { const v = money(b); if (v) e('financial.overdue_balance', v); } },
  { label: /^masshealth/i, run: (b, e) => e('financial.masshealth', b, { assertion: /^none$/i.test(b) ? 'reported_absent' : 'affirmed' }) },
  { label: /^application$/i, run: (b, e, s) => e('financial.application', b, { detail: s.label ?? '' }) },
  { label: /^next (scheduled )?(assessment|visit|reassessment)/i, run: (b, e) => e('followup.next_assessment', b, { assertion: 'planned' }) },
  { label: /^(primary )?emergency contact$/i, run: (b, e) => e('contacts.primary_emergency_contact', b) },
  { label: /^(alternate|secondary) emergency contact/i, run: (b, e) => e('contacts.alternate_emergency_contact', b) },
  { label: /^(health ?care proxy|hcp)$/i, run: (b, e) => e('contacts.health_care_proxy', b) },
  { label: /^(pcp|primary care( physician| provider)?)( (name|info|information|contact))?$/i, run: (b, e) => e('medical.pcp_info', b) },
  { label: /^program( type)?$/i, run: (b, e) => e('program.type', b) },
  { label: /^mls\b/i, run: (b, e) => e('mls.status', b, { assertion: /\bnot\b/i.test(b) ? 'not_completed' : 'affirmed' }) },
  {
    label: /^(person[- ]centered )?goals?(\(s\))?$|^person[- ]centered goal/i,
    run: (b, e) => {
      if (/\b(did not identify|no (new )?(person[- ]centered )?goals?|none( identified| reported)?|not identify any)\b/i.test(b)) {
        e('goals.new', /\bnew\b/i.test(b) ? 'No new person-centered goals reported' : 'No person-centered goals identified', { assertion: 'reported_absent' });
      } else e('goals.new', b);
    },
  },
  {
    label: /^(planned action|follow[- ]?up|plan|next steps?)/i,
    run: (b, e) => {
      if (NEGATED.test(b)) e('followup.action', b, { assertion: 'reported_absent', detail: 'Responsible: Not documented' });
      else e('followup.action', cap(b), { assertion: 'planned', detail: 'Responsible: Not documented' });
    },
  },
  {
    label: /\b(idc|interdisciplinary)\b/i,
    run: (b, e, s) => {
      if (/^(none|no|n\/a|not)\b/i.test(b)) e('followup.idc', `No IDC documented (${b})`, { assertion: 'reported_absent', detail: s.label ?? '' });
      else e('followup.idc', `${s.label?.replace(/^.*?\bwith\s+/i, '') ?? ''}: ${b}`.replace(/^: /, ''), { detail: s.label ?? '' });
    },
  },
  {
    label: /^risk( level)?\b/i,
    run: (b, e) => {
      const lvl = b.match(/\brisk(?:\s*level)?\s*:?\s*(\d)\b/i) ?? b.match(/^(\d)\b/);
      if (lvl) e('risk.level', `Risk ${lvl[1]}`);
      const fil = b.match(/\bFIL\s*:?\s*([0-9][A-Z]?)\b/i);
      if (fil) e('risk.fil_code', fil[1].toUpperCase());
    },
  },
  { label: /^(fil|fil code|functional impairment level)$/i, run: (b, e) => { const f = b.match(/\b([0-9][A-Z]?)\b/i); if (f) e('risk.fil_code', f[1].toUpperCase()); } },
];

// ---------------------------------------------------------------------------
// Content rules (any sentence, using the text without its field label)
// ---------------------------------------------------------------------------
function extractContent(s: Sentence, b: string, areas: FunctionalAreaDef[], emit: Emit, handled: Set<string>) {
  const once = (key: string, value: string, opts?: EmitOpts) => { if (!handled.has(key)) emit(key, value, opts); };
  let m: RegExpMatchArray | null;

  // ---------- Basic ----------
  if ((m = b.match(/\b(\d{2,3})[- ]year[- ]old\b/i))) emit('basic.age', m[1]);
  if ((m = b.match(/\b(single|married|widowed|divorced|separated)\b/i)) && /consumer|elder|client|year-old/i.test(b)) emit('basic.marital_status', cap(m[1].toLowerCase()));
  if ((m = b.match(/\b(female|male|woman|man)\b/i)) && /year-old|consumer|elder/i.test(b)) emit('basic.gender', /^(female|woman)$/i.test(m[1]) ? 'Female' : 'Male');
  if ((m = b.match(/\blives\s+(alone|with\s+.+?)(?:[.,;]|$)/i))) emit('basic.living_arrangement', `Lives ${m[1]}`);
  if ((m = b.match(/\b(?:assessment|visit)\s+(?:was\s+)?(?:held|completed|conducted)\s+(?:at|in)\s+(.+?)\.?$/i))) once('basic.location', m[1]);

  // ---------- Medical ----------
  if (/\balert and oriented\b|\boriented x ?\d/i.test(b)) emit('medical.cognitive_status', clean(b));
  if ((m = b.match(/\b(mini-?cog|moca|mmse|slums|memory screen(?:ing)?|cognitive screen(?:ing)?)\b/i))) {
    const tool = m[1];
    if (/\b(declined|refused)\b/i.test(b)) emit('medical.memory_screening', `${tool} not completed - consumer declined`, { assertion: 'declined' });
    else if (/\bnot (completed|done|administered)\b/i.test(b)) emit('medical.memory_screening', `${tool} not completed`, { assertion: 'not_completed' });
    else if ((m = b.match(/\bscore[d]?\s*(?:of|:)?\s*(\d+(?:\/\d+)?)/i))) emit('medical.memory_screening', `${tool} completed, score ${m[1]}`);
    else emit('medical.memory_screening', clean(b), { assertion: 'uncertain', confidence: 'low' });
  }
  if (!s.label && (m = b.match(/^(?:medical conditions?|diagnos[ie]s)\s*[:\-–]\s*(.+)$/i))) splitList(m[1]).forEach((c) => emit('medical.conditions', c));
  if (/\bmedications? (?:were |was )?reviewed\b/i.test(b)) emit('medical.medication_review', clean(b));
  if (/\bno (?:medication|med) changes\b|\bno changes in (?:medications?|meds)\b/i.test(b)) emit('medical.medication_review', 'No medication changes reported', { assertion: 'reported_absent' });
  if ((m = b.match(/\blast pcp (?:appointment|visit)\s+(?:was\s+)?(?:in\s+|on\s+)?(.+?)\.?$/i))) emit('medical.pcp_last_visit', m[1]);
  if (/\b(wants|would like|requests?|requested|looking for)\b.*\bnew pcp\b/i.test(b)) emit('medical.pcp_change_request', clean(b));
  if (/hospitali[sz]/i.test(b)) emit('medical.hospitalizations', clean(b), { assertion: /\b(no|denies|denied|without|not been)\b[^.]{0,40}hospitali[sz]/i.test(b) ? 'reported_absent' : 'affirmed' });
  if (/\bfalls?\b|\bfell\b/i.test(b) && !/fall risk/i.test(b)) emit('medical.falls', clean(b), { assertion: /\b(no|denies|denied|without)\b[^.]{0,40}\b(falls?|fell)\b/i.test(b) ? 'reported_absent' : 'affirmed' });
  if (/\b(recent(ly)?\b.*\b(surgery|surgeries|procedure)|(underwent|undergone|had)\b.*\bsurgery)\b/i.test(b) && !NEGATED.test(b)) {
    emit('medical.health_status_change', clean(b), { detail: 'Recent surgery/procedure reported', confidence: 'medium' });
  }
  if (/\bchanges? in (?:her |his |their )?(?:medical condition|health)/i.test(b)) emit('medical.health_status_change', clean(b), { assertion: NEGATED.test(b) ? 'reported_absent' : 'affirmed' });
  if (/\bchanges? in (?:her |his |their )?(?:needs|.*(formal services|informal supports))/i.test(b) || /^changes in needs/i.test(s.label ?? '')) {
    emit('services.changes', clean(b), { assertion: NEGATED.test(b) ? 'reported_absent' : 'affirmed' });
  }

  // ---------- Services ----------
  if (!s.label && (m = b.match(/^(?:current services|services)\s*:\s*(.+)$/i))) emit('services.current', clean(m[1]));
  if ((m = b.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:\/\s*week\s*|per week\s*|weekly\s*|of\s*)?(?:hha|home health aide)\b/i))) emit('services.hha_hours', `${m[1]} hours HHA`);
  if (/\b(PCA|personal care)\b/i.test(b) && (m = b.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(per week|\/\s*week|weekly|per month|monthly)?/i))) {
    const workers = b.match(/\b(?:through|with|by)\s+(\w+)\s+workers?\b/i)?.[1];
    emit('services.personal_care', `${m[1]} hours${m[2] ? ` ${m[2].replace(/\s+/g, ' ')}` : ''} PCA${workers ? ` (${workers} workers)` : ''}`);
  } else if (!handled.has('services.current') && /\bpersonal care\b|\(PC\)/i.test(b)) emit('services.personal_care', clean(b));
  if (/\bPERS\b/.test(b)) emit('services.pers', /\bno pers\b/i.test(b) ? 'No PERS' : 'PERS in place', { assertion: /\bno pers\b/i.test(b) ? 'reported_absent' : 'affirmed' });
  if (/\brn services?\b/i.test(b)) emit('services.rn', clean(b));
  if (/\b(PT|OT)\b/.test(b) || /physical therapy|occupational therapy/i.test(b)) {
    const prov = b.match(/^(.+?)\s+provides?\b/i)?.[1];
    emit('services.pt_ot', clean(b), { detail: prov ? `Provider: ${prov}` : '' });
    if (prov) emit('services.vendors', prov);
  }
  if ((m = b.match(/\bmay provide\s+(.+?)\s+in the future\b/i))) emit('services.future_services', m[1], { assertion: 'uncertain', confidence: 'medium' });
  if (/\bhomemak/i.test(b)) emit('services.homemaking', clean(b));
  if ((m = b.match(/^(.+?)\s+provides?\s+transportation\b/i))) {
    emit('services.transportation', clean(b), { detail: `Provider: ${m[1]}` });
    emit('services.vendors', m[1]);
  }
  if (/\bhome[- ]delivered meals\b|\bHDMs?\b|\bmeals on wheels\b/i.test(b)) emit('services.meals', 'Home Delivered Meals');
  else if (/\bmeals\b/i.test(b) && /(assist|provide|deliver|frozen)/i.test(b)) emit('services.meals', clean(b));
  if ((m = b.match(/\benrolled in\s+(?:the\s+)?([A-Z][\w-]*(?:\s+[A-Z][\w-]*)*)/))) once('program.type', m[1]);
  if (/\bsatisf(ied|action)\b/i.test(b)) emit('services.satisfaction', /\b(not|dis)satisf/i.test(b) ? clean(b) : 'Satisfied with current services', { assertion: 'affirmed' });
  if (/\badditional service needs?\b/i.test(b)) {
    const neg = /\b(no|did not|does not|not)\b[^.]*additional service needs?/i.test(b) || /^no additional/i.test(b);
    emit('services.additional_needs', neg ? 'No additional service needs identified' : clean(b), { assertion: neg ? 'reported_absent' : 'affirmed' });
  }
  if (!handled.has('services.informal_supports') && (m = b.match(/\b(family|daughter|son|spouse|friends?|neighbou?rs?|niece|nephew|sister|brother)\b.*\b(provides?|assists?|helps?|visits?|serves?)\b/i))) {
    emit('services.informal_supports', clean(b), { detail: cap(m[1].toLowerCase()) });
  }

  // ---------- Functional ----------
  extractFunctional(b, areas, emit);

  // ---------- Needs / goals ----------
  if (!handled.has('goals.new') && /\bgoals?\b/i.test(b) && /\bno new\b.*\bgoals?\b/i.test(b)) emit('goals.new', 'No new person-centered goals reported', { assertion: 'reported_absent' });

  // ---------- Eligibility / financial ----------
  if (/\b(continues to |does not |no longer )?meets?\b.*\beligibility\b/i.test(b)) {
    const neg = /\b(does not|no longer)\b/i.test(b);
    const val = neg ? 'Narrative states eligibility NOT met' : 'Narrative states eligibility met (not independently verified)';
    if (/\bage\b/i.test(b)) emit('eligibility.age', val);
    if (/\bneed\b/i.test(b)) emit('eligibility.need', val);
    if (/\bfil\b/i.test(b)) emit('eligibility.fil', val);
  }
  if (!handled.has('financial.annual_income') && /\bincome\b/i.test(b) && money(b)) emit('financial.annual_income', money(b)!);
  if (!handled.has('financial.copay') && (m = b.match(/\bco-?pay\b(?:\s+(?:of|is|was|amount))?\s*:?\s*(\$\s?[\d,]+(?:\.\d{2})?)/i))) emit('financial.copay', m[1].replace(/\s/g, ''));
  if (!handled.has('financial.overdue_balance') && /\b(overdue|past due) balance\b/i.test(b) && money(b)) emit('financial.overdue_balance', money(b)!);
  if (!s.label && (m = b.match(/^masshealth\s*:\s*(.+)$/i))) emit('financial.masshealth', clean(m[1]), { assertion: /^none\.?$/i.test(m[1].trim()) ? 'reported_absent' : 'affirmed' });
  if (/financial worksheet/i.test(b)) emit('financial.worksheet', clean(b), { assertion: /\bnot\b/i.test(b) ? 'not_completed' : 'affirmed' });
  if (!handled.has('financial.application') && /^application\b.*\b(completed|signed|submitted)\b/i.test(b)) emit('financial.application', clean(b));

  // ---------- Consent (check the label too, e.g. "Applicant Consent & Disclosure: Forms signed on 11/12/26") ----------
  const lb = `${s.isFirst && s.label ? `${s.label}: ` : ''}${b}`;
  const signedDate = lb.match(DATE)?.[0];
  if (/applicant consent\s*(?:and|&)\s*disclosure/i.test(lb)) emit('consent.applicant_consent', clean(lb), { detail: signedDate ? `Date: ${signedDate}` : '', assertion: /\bnot\b/i.test(b) ? 'not_completed' : 'affirmed' });
  if (/permission to contact emergency services/i.test(lb)) emit('consent.emergency_services_permission', clean(lb), { detail: signedDate ? `Date: ${signedDate}` : '', assertion: /\bnot\b/i.test(b) ? 'not_completed' : 'affirmed' });
  if (/privacy practices|hipaa/i.test(lb)) emit('consent.hipaa', clean(lb));
  if (/public benefits/i.test(lb)) emit('consent.public_benefits', clean(lb));

  // ---------- Risk ----------
  if (!handled.has('risk.level') && !s.label && (m = b.match(/^risk(?: level)?\s*:\s*(.+)$/i))) {
    const lvl = m[1].match(/\brisk(?:\s*level)?\s*(\d)\b/i) ?? m[1].match(/^(\d)\b/);
    if (lvl) emit('risk.level', `Risk ${lvl[1]}`);
    const fil = m[1].match(/\bFIL\s*([0-9][A-Z]?)\b/i);
    if (fil) emit('risk.fil_code', fil[1].toUpperCase());
  } else if (!handled.has('risk.level') && (m = b.match(/\brisk level\s*(?:of|is|:)?\s*(?:risk\s*)?(\d)\b/i))) emit('risk.level', `Risk ${m[1]}`);
  if (/\brisk factors?\b/i.test(b)) emit('risk.factors_change', clean(b), { assertion: NEGATED.test(b) ? 'reported_absent' : 'affirmed' });
  if (/risk worksheet/i.test(b)) emit('risk.worksheet', clean(b), { detail: signedDate ? `Date: ${signedDate}` : '' });

  // ---------- Follow-up ----------
  if ((m = b.match(/^(cm|case manager|care manager|rn|nurse|consumer|elder|family|daughter|son|supervisor)\s+will\s+(.+?)\.?$/i))) {
    const due = m[2].match(/\b(?:by|on|before|no later than)\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]+\.? \d{1,2},? \d{4})/);
    emit('followup.action', cap(m[2]), { detail: `Responsible: ${responsibleFrom(m[1])}${due ? `; Due: ${due[1]}` : ''}`, assertion: 'planned' });
  }
  if (!s.label && (m = b.match(/^next (?:scheduled )?(?:assessment|visit|reassessment)(?: date)?\s*:\s*(.+?)\.?$/i))) emit('followup.next_assessment', m[1], { assertion: 'planned' });
  if (!handled.has('followup.idc') && !s.label && (m = b.match(/\b(?:idc|interdisciplinary conference|interdisciplinary team conference)\b\s*(?:held\s+)?(?:with\s+)?(.*)$/i))) {
    const participants = m[1].replace(/^[:\-–\s]+/, '').replace(/\.$/, '');
    emit('followup.idc', participants || clean(b));
  }
  if (/\breferr(?:al|als|ed)\b/i.test(b)) emit('followup.referrals', clean(b), { assertion: NEGATED.test(b) ? 'reported_absent' : 'affirmed' });

  // ---------- Contacts ----------
  if (/emergency contacts?/i.test(lb) && /reviewed|updated|no changes|changed/i.test(b)) emit('contacts.emergency_contacts', clean(b));
  if (!s.label && (m = b.match(/^(?:primary )?emergency contact\s*:\s*(.+)$/i))) emit('contacts.primary_emergency_contact', clean(m[1]));

  // ---------- MLS, visits, suspension, program ----------
  if (!handled.has('mls.status') && /\bMLS\b/.test(b)) emit('mls.status', clean(b), { assertion: /\bnot\b/i.test(b) ? 'not_completed' : 'affirmed' });
  if (/\b(RD|RA|redetermination|reassessment)\b/.test(b) && /\b(visit|completed|due|attempt)/i.test(b)) emit('visits.rd_ra', clean(b));
  if (/\battempt(?:s|ed)?\b/i.test(b) && /\b(visit|call|contact)/i.test(b)) emit('visits.attempts', clean(b));
  if (/\bsuspen(?:d|sion|ded)\b/i.test(b)) emit('suspension.info', clean(b));
  if (/\bwaiver\b/i.test(b)) emit('program.waiver', clean(b));
}

function extractSentence(s: Sentence, areas: FunctionalAreaDef[], emit: Emit) {
  const handled = new Set<string>();
  const b = s.body;
  if (s.label && s.isFirst) {
    const tracking: Emit = (key, value, opts) => { handled.add(key); emit(key, value, opts); };
    for (const rule of LABEL_RULES) if (rule.label.test(s.label)) rule.run(clean(b), tracking, s);
  }
  extractContent(s, b, areas, emit, handled);
}

/** Rule-based extraction over every document (CDS Record facts are used for cross-document checks only). */
export function extractWithRules(docs: SourceDocument[], areas: FunctionalAreaDef[] = DEFAULT_FUNCTIONAL_AREAS): RawExtraction {
  const facts: RawFact[] = [];
  const seen = new Set<string>();
  for (const doc of docs) {
    const { sentences, blankFields } = parseDocument(doc);
    for (const s of sentences) {
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
    if (doc.type !== 'CDS Record') {
      for (const bf of blankFields) {
        facts.push({ key: 'documentation.blank_field', docId: doc.id, value: bf.label, detail: '', assertion: 'reported_absent', sourceText: bf.text, confidence: 'high' });
      }
    }
  }
  return { facts, injectionWarnings: [] };
}
