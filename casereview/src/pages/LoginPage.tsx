import { useState } from 'react';
import { useApp } from '../app/AppContext.tsx';
import { Button, Input, Label, Notice, Select } from '../components/ui.tsx';
import { ROLE_LABELS, type Role } from '../data/types.ts';
import { supabase } from '../lib/supabase.ts';

export function LoginPage() {
  const { demoSignIn, emailSignIn, authError, signOutReason } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('Demo Case Manager');
  const [role, setRole] = useState<Role>('case_manager');
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md border-[1.5px] border-slate-900 bg-white p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center bg-slate-900 font-mono text-sm text-white">QA</div>
          <div>
            <h1 className="text-lg font-semibold text-navy-950">CaseReview QA</h1>
            <p className="text-xs text-slate-500">Case management documentation &amp; CDS review assistant</p>
          </div>
        </div>
        {signOutReason && <Notice tone="blue" className="mb-4">{signOutReason}</Notice>}
        {authError && <Notice tone="red" className="mb-4">{authError}</Notice>}
        {supabase ? (
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await emailSignIn(email, password); setBusy(false); }}>
            <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div><Label htmlFor="pw">Password</Label><Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <Button variant="primary" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); demoSignIn(name, role); }}>
            <Notice tone="amber" title="Demo mode">
              Supabase is not configured, so this sign-in is a local demo session. Data stays in this browser. Use fictional test data only.
            </Notice>
            <div><Label htmlFor="name">Display name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div>
              <Label htmlFor="role">Role</Label>
              <Select id="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
            </div>
            <Button variant="primary" className="w-full">Enter demo workspace</Button>
          </form>
        )}
        <p className="mt-5 text-[11px] leading-relaxed text-slate-500">
          AI-generated content is a preparation aid for case manager review. It is not a final assessment, does not certify eligibility and does not certify QA results.
          This product is not affiliated with, endorsed by, or integrated with AgeSpan or WellSky.
        </p>
      </div>
    </div>
  );
}
