import { AlertTriangle, ClipboardList, FileWarning, ListTodo } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext.tsx';
import { Badge, Card, EmptyState, PageHeader, Stat, Table, Td, Th } from '../components/ui.tsx';
import { reviewProgress } from '../data/review-actions.ts';
import type { FinalReviewStatus, QaStatus } from '../engine/types.ts';

const FINAL: FinalReviewStatus[] = ['Corrections Required', 'Additional Documentation Required', 'Human Verification Required', 'Ready for Case Manager Review'];
const QA_STATUSES: QaStatus[] = ['Mismatch', 'Missing', 'Unable to Verify', 'Needs Review', 'Complete', 'Not Applicable'];

export function DashboardPage() {
  const { reviews, user } = useApp();
  const needsCorrections = reviews.filter((r) => r.analysis.finalStatus === 'Corrections Required').length;
  const missingDocs = reviews.reduce((n, r) => n + r.analysis.qa.filter((q) => q.status === 'Missing').length, 0);
  const pendingTasks = reviews.reduce((n, r) => n + r.tasks.filter((t) => t.status === 'Pending' || t.status === 'In Progress').length, 0);
  const qaCounts = QA_STATUSES.map((s) => ({ s, n: reviews.reduce((acc, r) => acc + r.analysis.qa.filter((q) => q.status === s).length, 0) }));
  const qaTotal = qaCounts.reduce((a, b) => a + b.n, 0) || 1;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.name}`}
        description="What would you like to do?"
      />
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <Link to="/annual" className="flex items-center gap-4 border-[1.5px] border-slate-900 bg-slate-900 p-6 text-white hover:bg-slate-700">
          <span className="grid h-12 w-12 shrink-0 place-items-center border-[1.5px] border-white font-mono text-xl">1</span>
          <span><span className="block text-xl font-semibold">Start an annual assessment</span><span className="block text-sm text-navy-100">Build the journal, then let the assistant fix it.</span></span>
        </Link>
        {reviews[0] ? (
          <Link to={`/reviews/${reviews[0].id}`} className="flex items-center gap-4 border-[1.5px] border-slate-900 bg-white p-6 hover:bg-slate-100">
            <span className="grid h-12 w-12 shrink-0 place-items-center border-[1.5px] border-slate-900 font-mono text-xl">2</span>
            <span><span className="block text-xl font-semibold">Continue case {reviews[0].input.caseIdentifier}</span><span className="block text-sm text-slate-600">Approve fixes, check the score, copy to WellSky.</span></span>
          </Link>
        ) : (
          <Link to="/new" className="flex items-center gap-4 border-[1.5px] border-slate-900 bg-white p-6 hover:bg-slate-100">
            <span className="grid h-12 w-12 shrink-0 place-items-center border-[1.5px] border-slate-900 font-mono text-xl">2</span>
            <span><span className="block text-xl font-semibold">Check a note</span><span className="block text-sm text-slate-600">Paste a note and see what QA would flag.</span></span>
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cases reviewed" value={reviews.length} icon={<ClipboardList size={16} />} />
        <Stat label="Needing corrections" value={needsCorrections} tone="red" icon={<AlertTriangle size={16} />} hint="Final status: Corrections Required" />
        <Stat label="Missing documentation" value={missingDocs} tone="amber" icon={<FileWarning size={16} />} hint="QA items marked Missing" />
        <Stat label="Pending follow-up tasks" value={pendingTasks} tone="purple" icon={<ListTodo size={16} />} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Recent assessments" className="lg:col-span-2" actions={<Link to="/reports" className="text-xs font-medium text-navy-700 hover:underline">All reports</Link>}>
          {reviews.length === 0 ? (
            <EmptyState title="No reviews yet">Start a <Link className="text-navy-700 underline" to="/new">new case review</Link> — you can load the fictional sample assessment.</EmptyState>
          ) : (
            <Table>
              <thead><tr><Th>Case</Th><Th>Assessment</Th><Th>Final status</Th><Th>Human review</Th><Th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {reviews.slice(0, 8).map((r) => {
                  const p = reviewProgress(r);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <Td className="font-medium text-slate-900">{r.input.caseIdentifier}</Td>
                      <Td>{r.input.assessmentType}<div className="text-xs text-slate-500">{r.input.assessmentDate || 'date not entered'}</div></Td>
                      <Td><Badge>{r.analysis.finalStatus}</Badge>{r.analysis.provider.mode === 'mock' && <div className="mt-1"><Badge tone="amber">Mock AI</Badge></div>}</Td>
                      <Td>
                        <div className="h-1.5 w-24 rounded bg-slate-100"><div className="h-1.5 rounded bg-navy-600" style={{ width: `${p.pct}%` }} /></div>
                        <span className="text-xs text-slate-500">{p.reviewed}/{p.total} items</span>
                      </Td>
                      <Td><Link to={`/reviews/${r.id}`} className="text-xs font-medium text-navy-700 hover:underline">Open</Link></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Review status">
            <ul className="space-y-2">
              {FINAL.map((s) => (
                <li key={s} className="flex items-center justify-between text-sm">
                  <Badge>{s}</Badge>
                  <span className="font-semibold text-slate-800">{reviews.filter((r) => r.analysis.finalStatus === s).length}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="QA checklist results" subtitle="All categories across reviews">
            <div className="mb-3 flex h-2 overflow-hidden rounded bg-slate-100">
              {qaCounts.map(({ s, n }) => n > 0 && (
                <div key={s} title={`${s}: ${n}`} style={{ width: `${(n / qaTotal) * 100}%` }}
                  className={{ Mismatch: 'bg-red-500', Missing: 'bg-red-300', 'Unable to Verify': 'bg-violet-400', 'Needs Review': 'bg-amber-400', Complete: 'bg-emerald-500', 'Not Applicable': 'bg-slate-300' }[s]} />
              ))}
            </div>
            <ul className="space-y-1.5 text-sm">
              {qaCounts.map(({ s, n }) => <li key={s} className="flex justify-between"><Badge>{s}</Badge><span className="text-slate-700">{n}</span></li>)}
            </ul>
            <p className="mt-3 text-xs text-slate-500">"Complete" results are review aids — no case is certified as passing QA.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
