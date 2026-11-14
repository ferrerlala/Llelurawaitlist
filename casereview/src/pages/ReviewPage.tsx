import { Download, FileDown, Printer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp, useReview } from '../app/AppContext.tsx';
import { EvidenceProvider } from '../components/review/EvidencePanel.tsx';
import { useReviewMutation } from '../components/review/DecisionControls.tsx';
import { AdlTab, CdsTab, CorrectionsTab, FollowUpTab, HistoryTab, QaTab, ReviewerNotes, SummaryTab } from '../components/review/tabs.tsx';
import { FixIssuesTab, JournalTab, QaScoreTab, WorkflowTab } from '../components/review/workflow-tabs.tsx';
import { ResultsTab } from '../components/review/results-tab.tsx';
import { WellskyTab } from '../components/review/wellsky-tab.tsx';
import { Badge, Button, EmptyState, Notice, PageHeader, Tabs } from '../components/ui.tsx';
import { audit, reviewProgress, setWorkflowStatus } from '../data/review-actions.ts';
import type { ReviewRecord } from '../data/types.ts';
import { downloadFile, exportWord, generateReportHtml } from '../report/report-generator.ts';
import { runIndependentQa } from '../workflow/independent-qa.ts';
import { HOSTED } from '../lib/hosted.ts';

export type ReviewTabId = 'results' | 'wellsky' | 'workflow' | 'journal' | 'fix' | 'score' | 'summary' | 'cds' | 'adl' | 'qa' | 'corrections' | 'followup' | 'report' | 'history';

export function ReviewTabContent({ review, tab, goTo }: { review: ReviewRecord; tab: ReviewTabId; goTo?: (t: ReviewTabId) => void }) {
  switch (tab) {
    case 'wellsky': return review.workflow ? <WellskyTab review={review} goTo={(t) => goTo?.(t)} /> : <SummaryTab review={review} />;
    case 'results': return review.workflow ? <ResultsTab review={review} goTo={(t) => goTo?.(t)} /> : <SummaryTab review={review} />;
    case 'workflow': return review.workflow ? <WorkflowTab review={review} goTo={(t) => goTo?.(t as ReviewTabId)} /> : <SummaryTab review={review} />;
    case 'journal': return review.workflow ? <JournalTab review={review} /> : <SummaryTab review={review} />;
    case 'fix': return review.workflow ? <FixIssuesTab review={review} /> : <CorrectionsTab review={review} />;
    case 'score': return review.workflow ? <QaScoreTab review={review} /> : <QaTab review={review} />;
    case 'summary': return <SummaryTab review={review} />;
    case 'cds': return <CdsTab review={review} />;
    case 'adl': return <AdlTab review={review} />;
    case 'qa': return <QaTab review={review} />;
    case 'corrections': return <CorrectionsTab review={review} />;
    case 'followup': return <FollowUpTab review={review} />;
    case 'report': return <ReportTab review={review} />;
    case 'history': return <HistoryTab review={review} />;
  }
}

function ReportTab({ review }: { review: ReviewRecord }) {
  const { settings } = useApp();
  const independent = review.workflow ? runIndependentQa(review, settings) : undefined;
  return (
    <div className="space-y-4">
      <ReviewerNotes review={review} />
      <ReportActions review={review} />
      <iframe title="Final case review report" sandbox="" srcDoc={generateReportHtml(review, { independent })} className="h-[900px] w-full rounded-lg border border-slate-200 bg-white" />
    </div>
  );
}

export function ReportActions({ review }: { review: ReviewRecord }) {
  const { settings } = useApp();
  if (HOSTED) return <Notice tone="blue">The full report is shown below. Printing, PDF and Word export are available when the app runs on your organization's own server or computer.</Notice>;
  return (
    <div className="flex flex-wrap gap-2">
      <Link to={`/reviews/${review.id}/print`} target="_blank"><Button variant="primary"><Printer size={15} /> Printable report / Save as PDF</Button></Link>
      <Button onClick={() => exportWord(review, review.workflow ? runIndependentQa(review, settings) : undefined)}><FileDown size={15} /> Export Word (.doc)</Button>
      <Button onClick={() => downloadFile(`case-review-${review.input.caseIdentifier}.json`, JSON.stringify({ input: { ...review.input, documents: review.input.documents.map((d) => ({ name: d.name, type: d.type })) }, analysis: review.analysis, decisions: review.decisions, tasks: review.tasks }, null, 2), 'application/json')}><Download size={15} /> Export JSON</Button>
    </div>
  );
}

export function ReviewPage() {
  const { id } = useParams();
  const review = useReview(id);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as ReviewTabId) || (review?.workflow ? 'results' : 'summary');
  if (!review) return <EmptyState title="Review not found"><Link to="/" className="text-navy-700 underline">Back to dashboard</Link></EmptyState>;
  return <ReviewView review={review} tab={tab} setTab={(t) => setParams({ tab: t })} />;
}

function ReviewView({ review, tab, setTab }: { review: ReviewRecord; tab: ReviewTabId; setTab: (t: ReviewTabId) => void }) {
  const { user, can, removeReview } = useApp();
  const navigate = useNavigate();
  const m = useReviewMutation(review);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const a = review.analysis;
  const p = reviewProgress(review);
  return (
    <EvidenceProvider documents={review.input.documents}>
      <PageHeader
        title={`Case ${review.input.caseIdentifier}`}
        description={<span>{review.input.assessmentType} · {review.input.assessmentDate || 'date not entered'} · {review.input.program || 'program not entered'} · {review.input.documents.length} document(s)</span>}
        actions={<>
          <Badge className="!text-sm">{a.finalStatus}</Badge>
          {a.provider.mode === 'mock' && <Badge tone="amber">Mock AI results</Badge>}
          <Badge tone="slate">{review.workflowStatus}</Badge>
          {user && review.workflowStatus !== 'Reviewed' && <Button size="sm" onClick={() => m.run(() => setWorkflowStatus(user, review, 'Reviewed'))}>Mark human review complete</Button>}
          {can('delete') && <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Delete</Button>}
        </>}
      />
      {confirmDelete && user && (
        <Notice tone="red" title="Delete this review permanently?" className="mb-4">
          <p>The review, its documents and results will be deleted. Audit entries are retained.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" onClick={async () => { await removeReview(review.id, [audit(user, review.id, 'review.deleted', 'review', review.id, review.input.caseIdentifier, null)]); navigate('/'); }}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        </Notice>
      )}
      <div className="no-print mb-4 flex items-center gap-3 text-xs text-slate-600">
        <div className="h-1.5 w-40 rounded bg-slate-200"><div className="h-1.5 rounded bg-navy-600" style={{ width: `${p.pct}%` }} /></div>
        Human review: {p.reviewed}/{p.total} suggestions reviewed (CDS {p.done.cds}/{p.totals.cds} · ADL {p.done.adl}/{p.totals.adl} · QA {p.done.qa}/{p.totals.qa} · Corrections {p.done.issue}/{p.totals.issue})
      </div>
      <Tabs<ReviewTabId> value={tab} onChange={setTab} tabs={[
        ...(review.workflow ? [
          { id: 'results' as const, label: 'Results' },
          { id: 'wellsky' as const, label: 'Copy to WellSky' },
          { id: 'workflow' as const, label: 'Workflow' },
          { id: 'journal' as const, label: 'Annual Journal', count: review.workflow.journal.versions.length },
          { id: 'fix' as const, label: 'Fix Documentation Issues' },
          { id: 'score' as const, label: 'QA Score' },
        ] : []),
        { id: 'summary', label: 'Assessment Summary' },
        { id: 'cds', label: 'CDS Preparation', count: a.cds.length },
        { id: 'adl', label: 'ADL/IADL Comparison', count: a.adl.length },
        { id: 'qa', label: 'QA Checklist', count: a.qa.length },
        { id: 'corrections', label: 'Corrections', count: a.issues.length },
        { id: 'followup', label: 'Follow-Up', count: review.tasks.length },
        { id: 'report', label: 'Final Report' },
        { id: 'history', label: 'Audit History' },
      ]} />
      {m.error && <Notice tone="red" className="mb-3">{m.error}</Notice>}
      <ReviewTabContent review={review} tab={tab} goTo={setTab} />
    </EvidenceProvider>
  );
}
