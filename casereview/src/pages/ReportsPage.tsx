import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext.tsx';
import { Badge, EmptyState, PageHeader, Table, Td, Th } from '../components/ui.tsx';
import { ReportActions } from './ReviewPage.tsx';

export function ReportsPage() {
  const { reviews } = useApp();
  return (
    <>
      <PageHeader title="Reports" description="Printable Final Case Review Reports and WellSky Transfer Guides. Reports are review aids and never certify QA or eligibility." />
      {!reviews.length ? <EmptyState title="No reports yet" /> : (
        <Table>
          <thead><tr><Th>Case</Th><Th>Assessment</Th><Th>Created</Th><Th>Final status</Th><Th>Export</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {reviews.map((r) => (
              <tr key={r.id}>
                <Td><Link className="font-medium text-navy-700 hover:underline" to={`/reviews/${r.id}?tab=report`}>{r.input.caseIdentifier}</Link></Td>
                <Td>{r.input.assessmentType}<div className="text-xs text-slate-500">{r.input.assessmentDate}</div></Td>
                <Td className="text-xs">{new Date(r.createdAt).toLocaleString()}<div className="text-slate-500">{r.createdByName}</div></Td>
                <Td><Badge>{r.analysis.finalStatus}</Badge></Td>
                <Td><ReportActions review={r} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
