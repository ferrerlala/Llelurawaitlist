import clsx from 'clsx';
import { ClipboardCheck, FilePlus2, FileText, LayoutDashboard, ListChecks, ListTodo, LogOut, Settings, ShieldAlert, Table2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../app/AppContext.tsx';
import { ROLE_LABELS } from '../data/types.ts';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/new', label: 'New Case Review', icon: FilePlus2 },
  { to: '/cds', label: 'CDS Preparation', icon: ClipboardCheck },
  { to: '/adl', label: 'ADL/IADL Comparison', icon: Table2 },
  { to: '/qa', label: 'Annual QA Review', icon: ListChecks },
  { to: '/tasks', label: 'Follow-Up Tasks', icon: ListTodo },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, settings, repo, signOut } = useApp();
  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-navy-950 text-navy-100 md:flex">
        <div className="px-5 py-5">
          <p className="text-base font-semibold text-white">CaseReview QA</p>
          <p className="text-xs text-navy-300">Documentation &amp; CDS review assistant</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => clsx('flex items-center gap-2.5 rounded-md px-3 py-2 text-sm', isActive ? 'bg-navy-800 text-white' : 'text-navy-200 hover:bg-navy-900 hover:text-white')}>
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-navy-900 px-5 py-4 text-xs text-navy-300">
          <p>Not affiliated with, endorsed by, or integrated with AgeSpan or WellSky.</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5 md:px-6">
          <nav className="flex gap-1 overflow-x-auto md:hidden">
            {NAV.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx('whitespace-nowrap rounded px-2 py-1 text-xs', isActive ? 'bg-navy-800 text-white' : 'text-slate-600')}>{label}</NavLink>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {settings.aiMode === 'mock' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-900 ring-1 ring-amber-300"><ShieldAlert size={13} /> MOCK AI MODE</span>
            ) : (
              <span className="rounded-full bg-navy-50 px-2.5 py-1 font-semibold text-navy-800 ring-1 ring-navy-200">Claude provider</span>
            )}
            {repo.kind === 'local-demo' && <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200">Demo storage (this browser only) – fictional data only</span>}
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <p className="font-medium text-slate-800">{user?.name}</p>
              <p className="text-xs text-slate-500">{user && ROLE_LABELS[user.role]} · {user?.organizationName}</p>
            </div>
            <button onClick={() => signOut()} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
