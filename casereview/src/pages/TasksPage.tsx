import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext.tsx';
import { Badge, EmptyState, PageHeader, Select, Table, Td, Th } from '../components/ui.tsx';
import { updateTask } from '../data/review-actions.ts';
import type { TaskStatus } from '../engine/types.ts';

const STATUSES: TaskStatus[] = ['Pending', 'In Progress', 'Completed', 'Cancelled'];

export function TasksPage() {
  const { reviews, user, persist } = useApp();
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const rows = reviews.flatMap((r) => r.tasks.map((t) => ({ r, t }))).filter(({ t }) => filter === 'all' || t.status === 'Pending' || t.status === 'In Progress');
  return (
    <>
      <PageHeader title="Follow-up tasks" description="Actions extracted from documented plans across all case reviews. Due dates are shown only when documented." actions={
        <Select value={filter} onChange={(e) => setFilter(e.target.value as 'open' | 'all')} className="!w-auto"><option value="open">Open tasks</option><option value="all">All tasks</option></Select>
      } />
      {!rows.length ? <EmptyState title="No tasks" /> : (
        <Table>
          <thead><tr><Th>Case</Th><Th>Task</Th><Th>Responsible</Th><Th>Due date</Th><Th>Status</Th><Th>Completion notes</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ r, t }) => (
              <tr key={`${r.id}-${t.id}`}>
                <Td><Link className="font-medium text-navy-700 hover:underline" to={`/reviews/${r.id}?tab=followup`}>{r.input.caseIdentifier}</Link></Td>
                <Td className="max-w-md">{t.description}<p className="text-xs text-slate-500">{t.followUp}</p></Td>
                <Td>{t.responsible}</Td>
                <Td>{t.dueDate ?? <span className="italic text-slate-500">Not documented</span>}</Td>
                <Td>
                  <Select value={t.status} className="!w-36" onChange={async (e) => { if (!user) return; const res = updateTask(user, r, t.id, { status: e.target.value as TaskStatus }); await persist(res.review, res.audit); }}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </Select>
                </Td>
                <Td className="text-xs">{t.completionNotes || <Badge tone="slate">none</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
