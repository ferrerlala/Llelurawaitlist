import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useApp } from '../app/AppContext.tsx';
import { Badge, EmptyState, PageHeader, Table, Td, Th } from '../components/ui.tsx';
import { runIndependentQa } from '../workflow/independent-qa.ts';

export function FixIssuesPage() {
  const { reviews, settings } = useApp();
  const rows = useMemo(() => reviews.filter((r) => r.workflow).map((r) => ({ r, qa: runIndependentQa(r, settings) })), [reviews, settings]);
  return (
    <>
      <PageHeader title="Fix Documentation Issues" description="Open journal/CDS findings and QA verification items for annual assessments prepared in this application." />
      {!rows.length ? <EmptyState title="No annual assessments yet"><Link className="text-navy-700 underline" to="/annual">Start an annual assessment</Link>.</EmptyState> : (
        <Table>
          <thead><tr><Th>Case</Th><Th>Assessment</Th><Th>Open findings</Th><Th>Critical</Th><Th>Pre-QA score</Th><Th>Status</Th><Th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ r, qa }) => (
              <tr key={r.id}>
                <Td className="font-medium">{r.input.caseIdentifier}</Td>
                <Td>{r.input.assessmentType}<div className="text-xs text-slate-500">{r.input.assessmentDate}</div></Td>
                <Td>{qa.openFindings.length}</Td>
                <Td>{qa.score.critical.length ? <Badge tone="red">{qa.score.critical.length}</Badge> : <Badge tone="green">0</Badge>}</Td>
                <Td className="font-semibold">{qa.score.score.toFixed(1)}<div className="text-xs font-normal text-slate-500">{qa.score.band}</div></Td>
                <Td><Badge tone={qa.score.readiness.ready ? 'green' : 'red'}>{qa.score.readiness.label}</Badge></Td>
                <Td><Link className="text-sm font-medium text-navy-700 hover:underline" to={`/reviews/${r.id}?tab=fix`}>Fix issues</Link></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
