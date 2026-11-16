import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../app/AppContext.tsx';
import { EvidenceProvider } from '../components/review/EvidencePanel.tsx';
import { Badge, EmptyState, Label, PageHeader, Select } from '../components/ui.tsx';
import { ReviewTabContent, type ReviewTabId } from './ReviewPage.tsx';

const META: Record<'cds' | 'adl' | 'qa', { title: string; description: string }> = {
  cds: { title: 'CDS Preparation', description: 'Suggested CDS responses organized by section, each with its supporting sentence, confidence and verification status. Copy verified responses for manual entry into WellSky.' },
  adl: { title: 'ADL/IADL Comparison', description: 'Every configured functional area compared between the narrative and the supplied CDS record. Silence is never treated as independence.' },
  qa: { title: 'Annual QA Review', description: 'The 17 configurable annual QA categories with evidence found, evidence missing and recommended corrections.' },
};

export function SectionPage({ section }: { section: 'cds' | 'adl' | 'qa' }) {
  const { reviews } = useApp();
  const [params, setParams] = useSearchParams();
  const review = reviews.find((r) => r.id === params.get('review')) ?? reviews[0];
  const meta = META[section];
  return (
    <>
      <PageHeader title={meta.title} description={meta.description} />
      {!review ? (
        <EmptyState title="No reviews yet"><Link className="text-navy-700 underline" to="/new">Create a case review</Link> to see results here.</EmptyState>
      ) : (
        <>
          <div className="no-print mb-4 flex flex-wrap items-end gap-3">
            <div className="w-full max-w-md">
              <Label htmlFor="rev">Case review</Label>
              <Select id="rev" value={review.id} onChange={(e) => setParams({ review: e.target.value })}>
                {reviews.map((r) => <option key={r.id} value={r.id}>{r.input.caseIdentifier} · {r.input.assessmentType} · {r.input.assessmentDate || new Date(r.createdAt).toLocaleDateString()}</option>)}
              </Select>
            </div>
            <Badge>{review.analysis.finalStatus}</Badge>
            <Link to={`/reviews/${review.id}?tab=${section}`} className="text-sm font-medium text-navy-700 hover:underline">Open full review</Link>
          </div>
          <EvidenceProvider documents={review.input.documents}>
            <ReviewTabContent review={review} tab={section as ReviewTabId} />
          </EvidenceProvider>
        </>
      )}
    </>
  );
}
