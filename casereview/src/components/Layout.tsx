import clsx from 'clsx';
import { CalendarPlus, FileText, LayoutDashboard, LogOut, Settings, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../app/AppContext.tsx';
import { ROLE_LABELS } from '../data/types.ts';

const MAIN = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/annual', label: 'Start Annual Assessment', icon: CalendarPlus },
  { to: '/reports', label: 'My Cases & Reports', icon: FileText },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, settings, repo, signOut, can } = useApp();
  const nav = can('configure') ? [...MAIN, { to: '/settings', label: 'Settings', icon: Settings, end: false }] : MAIN;
  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-navy-950 text-navy-100 md:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid h-8 w-8 shrink-0 place-items-center border-[1.5px] border-white font-mono text-xs text-white">QA</div>
          <div>
            <p className="font-display text-base font-semibold text-white">CaseReview QA</p>
            <p className="text-xs text-navy-200">Case documentation review</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => clsx('flex items-center gap-3 px-3 py-3 text-base', isActive ? 'bg-white/15 font-medium text-white' : 'text-navy-100 hover:bg-white/10 hover:text-white')}>
              <Icon size={18} /> {label}
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
            {nav.map(({ to, label, end }) => (
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
