import { FileUp, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DOCUMENT_TYPES, scanForInjection, type DocumentType, type SourceDocument } from '@shared/extraction-contract.ts';
import { useApp } from '../app/AppContext.tsx';
import { runAnalysis } from '../app/run-analysis.ts';
import { Button, Card, Input, Label, Notice, PageHeader, Select, TextArea } from '../components/ui.tsx';
import { SAMPLE_CDS_RECORD, SAMPLE_FINANCIAL_WORKSHEET, SAMPLE_NARRATIVE } from '../config/sample-data.ts';
import { newId } from '../data/repository.ts';
import { createReview } from '../data/review-actions.ts';
import { ASSESSMENT_TYPES, type AssessmentType } from '../engine/types.ts';
import { ACCEPTED_FILE_TYPES, extractTextFromFile } from '../lib/document-text.ts';

function guessType(name: string): DocumentType {
  const n = name.toLowerCase();
  if (/cds/.test(n)) return 'CDS Record';
  if (/risk/.test(n)) return 'Risk Worksheet';
  if (/financial|worksheet/.test(n)) return 'Financial Worksheet';
  if (/consent|disclosure/.test(n)) return 'Applicant Consent and Disclosure';
  if (/suspen/.test(n)) return 'Service Suspension Record';
  if (/narrative|journal|note|assessment/.test(n)) return 'Narrative / Journal Note';
  return 'Other Supporting Document';
}

const blankNarrative = (): SourceDocument => ({ id: newId('doc'), name: 'Narrative / journal note', type: 'Narrative / Journal Note', text: '' });

export function NewReviewPage() {
  const { user, settings, persist } = useApp();
  const navigate = useNavigate();
  const [caseIdentifier, setCaseIdentifier] = useState('');
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('Annual Redetermination');
  const [assessmentDate, setAssessmentDate] = useState('');
  const [program, setProgram] = useState('Home Care');
  const [docs, setDocs] = useState<SourceDocument[]>([blankNarrative()]);
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploadMsg, setUploadMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const updateDoc = (id: string, patch: Partial<SourceDocument>) => setDocs((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const addDoc = (doc: Partial<SourceDocument>) => setDocs((d) => [...d, { ...blankNarrative(), type: 'Other Supporting Document', name: 'Supporting document', ...doc, id: newId('doc') }]);

  const loadSample = () => {
    setCaseIdentifier('DEMO-0001');
    setAssessmentType('Annual Redetermination');
    setAssessmentDate('2025-10-01');
    setProgram('Home Care');
    setDocs([{ id: newId('doc'), name: 'Annual assessment narrative (fictional)', type: 'Narrative / Journal Note', text: SAMPLE_NARRATIVE }]);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadMsg('');
    const added: SourceDocument[] = [];
    const errors: string[] = [];
    for (const f of Array.from(files)) {
      try {
        const text = await extractTextFromFile(f);
        added.push({ id: newId('doc'), name: f.name, type: guessType(f.name), text });
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    setDocs((d) => {
      const base = d.length === 1 && !d[0].text.trim() ? [] : d;
      return [...base, ...added];
    });
    setUploadMsg([added.length ? `Extracted text from ${added.length} file(s). Review the text and document type below.` : '', ...errors].filter(Boolean).join(' '));
    if (fileRef.current) fileRef.current.value = '';
  };

  const injection = scanForInjection(docs);
  const hasText = docs.some((d) => d.text.trim());
  const needsAttest = settings.aiMode === 'claude';

  const analyze = async () => {
    if (!user) return;
    setError('');
    if (!caseIdentifier.trim()) { setError('Enter a consumer identifier or internal case number.'); return; }
    if (needsAttest && !attest) { setError('Confirm the documents contain only fictional or de-identified test data before sending them to an external AI service.'); return; }
    setBusy(true);
    try {
      const input = { caseIdentifier: caseIdentifier.trim(), assessmentType, assessmentDate, program, documents: docs };
      const analysis = await runAnalysis(input, settings, { fictionalDataAttestation: attest });
      const { review, audit } = createReview(user, { ...input, documents: docs.filter((d) => d.text.trim()) }, analysis);
      await persist(review, audit);
      navigate(`/reviews/${review.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="New case review"
        description="Paste one annual assessment or journal note, or upload documents. Add supporting documents (CDS record, Financial Worksheet, Consent and Disclosure, Risk Worksheet) to enable cross-document checks."
        actions={<Button onClick={loadSample}><Sparkles size={15} /> Load fictional sample</Button>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Case information" className="lg:col-span-1">
          <div className="space-y-3">
            <div>
              <Label htmlFor="cid">Consumer identifier / case number</Label>
              <Input id="cid" value={caseIdentifier} onChange={(e) => setCaseIdentifier(e.target.value)} placeholder="Internal case number" />
              <p className="mt-1 text-xs text-slate-500">Use an internal identifier, not the consumer's name.</p>
            </div>
            <div>
              <Label htmlFor="atype">Assessment type</Label>
              <Select id="atype" value={assessmentType} onChange={(e) => setAssessmentType(e.target.value as AssessmentType)}>
                {ASSESSMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </div>
            <div><Label htmlFor="adate">Assessment date</Label><Input id="adate" type="date" value={assessmentDate} onChange={(e) => setAssessmentDate(e.target.value)} /></div>
            <div><Label htmlFor="prog">Program</Label><Input id="prog" value={program} onChange={(e) => setProgram(e.target.value)} placeholder="e.g. Home Care, CHOICES" /></div>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {docs.map((d, i) => (
            <Card key={d.id}
              title={<span>Document {i + 1}</span>}
              actions={docs.length > 1 && <Button size="sm" variant="ghost" onClick={() => setDocs(docs.filter((x) => x.id !== d.id))} aria-label="Remove document"><Trash2 size={14} /> Remove</Button>}>
              <div className="mb-3 grid gap-3 sm:grid-cols-2">
                <div><Label>Name</Label><Input value={d.name} onChange={(e) => updateDoc(d.id, { name: e.target.value })} /></div>
                <div>
                  <Label>Document type</Label>
                  <Select value={d.type} onChange={(e) => updateDoc(d.id, { type: e.target.value as DocumentType })}>
                    {DOCUMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </div>
              </div>
              <TextArea rows={d.type === 'Narrative / Journal Note' ? 16 : 7} value={d.text} onChange={(e) => updateDoc(d.id, { text: e.target.value })}
                placeholder={d.type === 'CDS Record' ? 'Paste CDS responses as "Field: Value" lines, e.g. "Bathing: Assistance required"' : 'Paste the narrative or journal note here'} className="font-mono text-[13px]" />
              <p className="mt-1 text-xs text-slate-500">{d.text.length.toLocaleString()} characters</p>
            </Card>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => addDoc({})}><Plus size={15} /> Add supporting document</Button>
            <Button onClick={() => fileRef.current?.click()}><FileUp size={15} /> Upload PDF / DOCX / TXT</Button>
            <input ref={fileRef} type="file" multiple accept={ACCEPTED_FILE_TYPES} className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <Button variant="ghost" onClick={() => addDoc({ name: 'CDS excerpt (fictional)', type: 'CDS Record', text: SAMPLE_CDS_RECORD })}>+ Sample CDS record</Button>
            <Button variant="ghost" onClick={() => addDoc({ name: 'Financial worksheet (fictional)', type: 'Financial Worksheet', text: SAMPLE_FINANCIAL_WORKSHEET })}>+ Sample financial worksheet</Button>
          </div>
          {uploadMsg && <Notice tone="blue">{uploadMsg}</Notice>}
          {injection.length > 0 && (
            <Notice tone="red" title="Possible embedded instructions detected">
              Document text will be treated as data only. Review: {injection.slice(0, 3).join(' · ')}
            </Notice>
          )}

          <Card>
            {settings.aiMode === 'mock' ? (
              <Notice tone="amber" title="Mock AI mode">Extraction uses the built-in rule-based engine. No document text leaves this application. Results are labeled as mock results.</Notice>
            ) : (
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-1" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
                <span>I confirm these documents contain <strong>only fictional or de-identified test data</strong>. Real consumer information must not be sent to an external AI service until organizational approval and a Business Associate Agreement are in place.</span>
              </label>
            )}
            {error && <Notice tone="red" className="mt-3">{error}</Notice>}
            <div className="mt-4 flex justify-end">
              <Button variant="primary" onClick={analyze} disabled={busy || !hasText}>
                {busy ? <><Loader2 size={15} className="animate-spin" /> Analyzing…</> : 'Analyze documentation'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
