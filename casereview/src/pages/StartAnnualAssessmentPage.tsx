import clsx from 'clsx';
import { ArrowLeft, CheckCircle2, FileCheck2, Loader2, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../app/AppContext.tsx';
import { useAnalyzer } from '../app/use-analyzer.ts';
import { Badge, Button, Card, Input, Label, Notice, PageHeader, Select, TextArea } from '../components/ui.tsx';
import { JOURNAL_SECTIONS } from '../config/journal-template.ts';
import { SAMPLE_ANNUAL_CHANGES, SAMPLE_PREVIOUS_JOURNAL } from '../config/sample-data.ts';
import { ASSESSMENT_TYPES, type AssessmentType } from '../engine/types.ts';
import { approveJournal, latestJournal } from '../workflow/engine.ts';
import { CLARIFY_RE, composeJournal, journalProblems, previousValues, type FieldReviewStatus, type JournalDraft, type JournalFieldInput } from '../workflow/journal-builder.ts';
import type { ReviewRecord } from '../data/types.ts';

const STATE_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'purple'> = {
  new: 'blue', changed: 'blue', confirmed: 'green', 'carried-flagged': 'amber', clarify: 'red', omitted: 'slate', auto: 'green',
};
const STATE_LABEL: Record<string, string> = {
  new: 'New', changed: 'Changed', confirmed: 'Unchanged – confirmed', 'carried-flagged': 'Carried forward – check', clarify: 'Needs clarification', omitted: 'Omitted (optional)', auto: 'Filled automatically',
};

function previousJournalText(r: ReviewRecord): string {
  return latestJournal(r)?.text ?? r.input.documents.filter((d) => d.type === 'Narrative / Journal Note').map((d) => d.text).join('\n') ?? '';
}

export function StartAnnualAssessmentPage() {
  const { user, settings, reviews, persist } = useApp();
  const navigate = useNavigate();
  const template = settings.journalTemplate;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [caseId, setCaseId] = useState('');
  const [assessmentDate, setAssessmentDate] = useState('');
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('Annual Redetermination');
  const [program, setProgram] = useState('');
  const [prevText, setPrevText] = useState<string | null>(null);
  const [prevMeta, setPrevMeta] = useState<{ id: string | null; date: string | null; label: string } | null>(null);
  const [inputs, setInputs] = useState<Record<string, JournalFieldInput>>({});
  const [draft, setDraft] = useState<JournalDraft | null>(null);
  const [journalText, setJournalText] = useState('');
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const analyze = useAnalyzer(null, attest);

  const caseIds = useMemo(() => [...new Set(reviews.map((r) => r.input.caseIdentifier))].sort(), [reviews]);
  const previous = useMemo(() => previousValues(template, prevText), [template, prevText]);

  const retrieve = () => {
    setError('');
    const prior = reviews
      .filter((r) => r.input.caseIdentifier === caseId.trim() && (!assessmentDate || !r.input.assessmentDate || r.input.assessmentDate < assessmentDate))
      .sort((a, b) => (b.input.assessmentDate || b.createdAt).localeCompare(a.input.assessmentDate || a.createdAt))[0];
    if (prior) {
      setPrevText(previousJournalText(prior));
      setPrevMeta({ id: prior.id, date: prior.input.assessmentDate || null, label: `${prior.input.assessmentType} ${prior.input.assessmentDate || ''} (${prior.workflow ? `journal v${latestJournal(prior)?.version}` : 'narrative review'})` });
      if (!program) setProgram(prior.input.program);
    } else {
      setPrevText(null);
      setPrevMeta({ id: null, date: null, label: 'No previous assessment on file for this case in this application' });
    }
    setInputs({});
    setStep(2);
  };

  const loadExample = () => {
    setCaseId('DEMO-0002');
    setAssessmentDate('2026-11-12');
    setAssessmentType('Annual Redetermination');
    setProgram('HCB-NW');
    setPrevText(SAMPLE_PREVIOUS_JOURNAL);
    setPrevMeta({ id: null, date: '2025-11-06', label: 'Fictional example: Annual Redetermination 11/6/2025' });
    setInputs(Object.fromEntries(Object.entries(SAMPLE_ANNUAL_CHANGES).map(([id, [status, text]]) => [id, { fieldId: id, status, newText: text, note: '' }])));
    setStep(2);
  };

  const setField = (fieldId: string, patch: Partial<JournalFieldInput>) =>
    setInputs((s) => ({ ...s, [fieldId]: { ...{ fieldId, status: 'not_reviewed' as FieldReviewStatus, newText: '', note: '' }, ...s[fieldId], ...patch } }));

  const generate = () => {
    const d = composeJournal({ template, assessmentDate, previous, inputs });
    setDraft(d);
    setJournalText(d.text);
    setStep(3);
  };

  const problems = journalProblems(journalText);
  const markers = (journalText.match(CLARIFY_RE) ?? []).length;

  const approve = async () => {
    if (!user || !draft) return;
    if (settings.aiMode === 'claude' && !attest) { setError('Confirm the journal contains only fictional or de-identified test data before using an external AI provider.'); return; }
    setBusy(true);
    setError('');
    try {
      const { review, audit } = await approveJournal({
        user, analyze, caseIdentifier: caseId.trim(), assessmentType, assessmentDate, program, journalText, inputs, draftFields: draft.fields, template,
        previousReviewId: prevMeta?.id ?? null, previousAssessmentDate: prevMeta?.date ?? null,
      });
      await persist({ ...review, workflow: { ...review.workflow!, aiAttested: attest } }, audit);
      navigate(`/reviews/${review.id}?tab=results`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reviewed = template.fields.filter((f) => inputs[f.id] && inputs[f.id].status !== 'not_reviewed').length;

  return (
    <>
      <PageHeader
        title="Start Annual Assessment"
        description="Previous assessment + new changes → annual journal draft → your approval → automatic CDS preparation, consistency validation and independent QA."
        actions={step === 1 && <Button onClick={loadExample}><Sparkles size={15} /> Load fictional example (Nov 12, 2026)</Button>}
      />
      <ol className="mb-5 flex flex-wrap gap-2 text-xs">
        {['1. Select case', '2. Review previous & enter changes', '3. Edit & approve journal'].map((s, i) => (
          <li key={s} className={clsx('rounded-full px-3 py-1 font-medium ring-1', step === i + 1 ? 'bg-navy-800 text-white ring-navy-800' : step > i + 1 ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-white text-slate-500 ring-slate-200')}>{s}</li>
        ))}
      </ol>

      {step === 1 && (
        <Card title="Case and assessment">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label htmlFor="cid">Internal case ID</Label>
              <Input id="cid" list="case-ids" value={caseId} onChange={(e) => setCaseId(e.target.value)} placeholder="e.g. DEMO-0002" />
              <datalist id="case-ids">{caseIds.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div><Label htmlFor="ad">Assessment date</Label><Input id="ad" type="date" value={assessmentDate} onChange={(e) => setAssessmentDate(e.target.value)} /></div>
            <div><Label htmlFor="at">Assessment type</Label><Select id="at" value={assessmentType} onChange={(e) => setAssessmentType(e.target.value as AssessmentType)}>{ASSESSMENT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></div>
            <div><Label htmlFor="pg">Program</Label><Input id="pg" value={program} onChange={(e) => setProgram(e.target.value)} /></div>
          </div>
          <div className="mt-4 flex justify-end"><Button variant="primary" disabled={!caseId.trim() || !assessmentDate} onClick={retrieve}>Retrieve previous assessment</Button></div>
          <p className="mt-2 text-xs text-slate-500">Previous assessments are retrieved only from reviews stored in this application for your organization.</p>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Notice tone={prevText ? 'blue' : 'amber'} title={prevText ? 'Previous assessment retrieved' : 'No previous assessment'}>
            {prevMeta?.label}. For each item choose <strong>Unchanged</strong> (confirmed still accurate), <strong>Changed</strong> (enter the update) or <strong>Clarify</strong>. Items you do not review are NOT carried forward — they appear as clarification markers in the draft.
          </Notice>
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{reviewed} of {template.fields.length} items reviewed</span>
            <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft size={14} /> Back</Button>
          </div>
          {JOURNAL_SECTIONS.map((section, si) => {
            const fields = template.fields.filter((f) => f.section === section);
            if (!fields.length) return null;
            return (
              <Card key={section} title={`${si + 1}. ${section}`}
                actions={fields.some((f) => previous[f.id]?.text) && (
                  <Button size="sm" variant="ghost" onClick={() => fields.forEach((f) => previous[f.id]?.text && !inputs[f.id]?.newText && setField(f.id, { status: 'unchanged' }))}><CheckCircle2 size={13} /> Confirm section unchanged</Button>
                )}>
                <div className="space-y-4">
                  {fields.map((f) => {
                    const prev = previous[f.id];
                    const inp = inputs[f.id] ?? { status: 'not_reviewed' as FieldReviewStatus, newText: '', note: '' };
                    return (
                      <div key={f.id} className="grid gap-3 border-b border-slate-100 pb-3 last:border-0 md:grid-cols-[1fr_1fr]">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{f.prefix}{f.label}{!f.required && <span className="ml-1 text-xs font-normal text-slate-400">(optional)</span>}</p>
                          {f.hint && <p className="text-xs text-slate-500">{f.hint}</p>}
                          <p className="mt-1 rounded bg-slate-50 p-2 text-xs text-slate-700">
                            {f.id === 'assessment_date' ? `Filled from the assessment date (${assessmentDate || 'not set'})` : prev?.text ?? <span className="italic text-slate-400">Not in the previous assessment</span>}
                            {prev?.source === 'facts' && <Badge tone="purple" className="ml-1">recovered from narrative</Badge>}
                          </p>
                        </div>
                        {f.id === 'assessment_date' ? <div className="text-xs text-slate-500">Automatic</div> : (
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap gap-1">
                              {(['unchanged', 'changed', 'clarify'] as FieldReviewStatus[]).map((st) => (
                                <button key={st} type="button" disabled={st === 'unchanged' && !prev?.text}
                                  onClick={() => setField(f.id, { status: st })}
                                  className={clsx('rounded px-2 py-1 text-xs font-medium ring-1 disabled:opacity-40', inp.status === st ? 'bg-navy-800 text-white ring-navy-800' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}>
                                  {st === 'unchanged' ? 'Unchanged' : st === 'changed' ? (prev?.text ? 'Changed' : 'Enter') : 'Clarify'}
                                </button>
                              ))}
                              {inp.status === 'not_reviewed' && <Badge tone="slate">not reviewed</Badge>}
                            </div>
                            {inp.status === 'changed' && (
                              <TextArea rows={2} value={inp.newText} placeholder="Updated information (without the label)" onChange={(e) => setField(f.id, { newText: e.target.value })} />
                            )}
                            {inp.status === 'clarify' && (
                              <Input value={inp.note} placeholder="What needs clarification?" onChange={(e) => setField(f.id, { note: e.target.value })} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white/90 p-3 backdrop-blur">
            <Button variant="primary" onClick={generate}><FileCheck2 size={15} /> Prepare annual journal draft</Button>
          </div>
        </div>
      )}

      {step === 3 && draft && (
        <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
          <div className="space-y-3">
            <Notice tone="blue" title="Draft prepared by rule-based assembly">
              Each line is your entry, a previous line you confirmed, or a clarification marker. No medical, service, financial or eligibility information is generated. Edit anything below before approving.
            </Notice>
            <TextArea rows={40} className="font-mono text-[12.5px] leading-relaxed" value={journalText} onChange={(e) => setJournalText(e.target.value)} aria-label="Annual journal" />
            {problems.map((p) => <Notice key={p} tone={/CLARIFY|clarification/.test(p) ? 'red' : 'amber'}>{p}</Notice>)}
            {settings.aiMode === 'claude' && (
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-1" /> This journal contains only fictional or de-identified test data.</label>
            )}
            {error && <Notice tone="red">{error}</Notice>}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft size={14} /> Back to changes</Button>
              <Button variant="primary" disabled={busy || markers > 0} onClick={approve}>
                {busy ? <><Loader2 size={15} className="animate-spin" /> Preparing CDS…</> : 'Approve journal & prepare CDS'}
              </Button>
            </div>
            {markers > 0 && <p className="text-right text-xs text-red-700">Resolve every [[CLARIFY: …]] marker (enter the information, or delete the line content) before approval.</p>}
          </div>
          <Card title="Changes from the previous assessment" subtitle={`${draft.fields.filter((f) => f.state === 'changed' || f.state === 'new').length} changed/new · ${draft.fields.filter((f) => f.state === 'carried-flagged').length} carried forward to check · ${draft.clarifyCount} to clarify`}>
            <ul className="max-h-[70rem] space-y-2 overflow-y-auto">
              {draft.fields.filter((f) => f.state !== 'omitted').map((f) => (
                <li key={f.fieldId} className={clsx('rounded-md border p-2 text-xs', f.state === 'clarify' ? 'border-red-200 bg-red-50/50' : f.state === 'changed' || f.state === 'new' ? 'border-navy-200 bg-navy-50/40' : f.state === 'carried-flagged' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200')}>
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-800">{f.label}</span><Badge tone={STATE_TONE[f.state]}>{STATE_LABEL[f.state]}</Badge></div>
                  {f.changes.map((c) => <p key={c} className="mt-0.5 text-navy-800">• {c}</p>)}
                  {f.warnings.map((w) => <p key={w} className="mt-0.5 text-amber-800">⚠ {w}</p>)}
                  {f.state === 'changed' && f.previous && <p className="mt-0.5 text-slate-400 line-through">{f.previous.slice(0, 220)}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
