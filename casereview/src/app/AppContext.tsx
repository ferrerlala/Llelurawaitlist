import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultSettings } from '../data/default-settings.ts';
import { LocalRepository } from '../data/local-repository.ts';
import type { Repository } from '../data/repository.ts';
import { SupabaseRepository } from '../data/supabase-repository.ts';
import type { AppUser, AuditEntry, OrgSettings, ReviewRecord, Role } from '../data/types.ts';
import { supabase } from '../lib/supabase.ts';
import { HOSTED } from '../lib/hosted.ts';
import { buildExampleReview } from './seed-example.ts';

interface AppState {
  user: AppUser | null;
  repo: Repository;
  settings: OrgSettings;
  reviews: ReviewRecord[];
  loading: boolean;
  authError: string;
  demoSignIn(name: string, role: Role): void;
  emailSignIn(email: string, password: string): Promise<void>;
  signOut(reason?: string): Promise<void>;
  signOutReason: string;
  refreshReviews(): Promise<void>;
  persist(review: ReviewRecord, audit: AuditEntry[]): Promise<void>;
  removeReview(id: string, audit: AuditEntry[]): Promise<void>;
  saveSettings(next: OrgSettings, audit: AuditEntry[]): Promise<void>;
  can(action: 'configure' | 'delete' | 'viewAudit'): boolean;
}

const Ctx = createContext<AppState | null>(null);
const DEMO_SESSION_KEY = 'casereview:demo-session';

export function AppProvider({ children }: { children: ReactNode }) {
  const repo = useMemo<Repository>(() => (supabase ? new SupabaseRepository(supabase) : new LocalRepository()), []);
  const [user, setUser] = useState<AppUser | null>(null);
  const [settings, setSettings] = useState<OrgSettings>(defaultSettings());
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [signOutReason, setSignOutReason] = useState('');

  // Restore session.
  useEffect(() => {
    if (!supabase) {
      try {
        const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
        if (raw) setUser(JSON.parse(raw) as AppUser);
      } catch { /* ignore */ }
      setLoading(false);
      return;
    }
    const loadProfile = async (uid: string, email: string) => {
      const { data, error } = await supabase!.from('profiles').select('full_name, role, organization_id, organizations(name)').eq('id', uid).maybeSingle();
      if (error || !data) {
        setAuthError('Your account is not linked to an organization. Ask an administrator to add your profile.');
        setUser(null);
        return;
      }
      const org = (data as unknown as { organizations: { name: string } | null }).organizations;
      setUser({ id: uid, email, name: data.full_name || email, role: data.role as Role, organizationId: data.organization_id, organizationName: org?.name ?? '' });
    };
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await loadProfile(data.session.user.id, data.session.user.email ?? '');
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) setUser(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshReviews = useCallback(async () => {
    if (!user) return;
    setReviews(await repo.listReviews(user));
  }, [repo, user]);

  useEffect(() => {
    if (!user) { setReviews([]); return; }
    repo.getSettings(user).then(setSettings).catch(() => setSettings(defaultSettings()));
    (async () => {
      let list = await repo.listReviews(user);
      // Hosted demo: start with the fictional Nov 12, 2026 example so the workflow is visible immediately.
      if (HOSTED && repo.kind === 'local-demo' && !list.length) {
        const { review, audit } = await buildExampleReview(user, defaultSettings());
        await repo.saveReview(user, review);
        await repo.appendAudit(user, audit);
        list = await repo.listReviews(user);
      }
      setReviews(list);
    })().catch(() => setReviews([]));
  }, [user, repo]);

  const signOut = useCallback(async (reason = '') => {
    setSignOutReason(reason);
    try { sessionStorage.removeItem(DEMO_SESSION_KEY); } catch { /* ignore */ }
    if (supabase) await supabase.auth.signOut();
    setUser(null);
  }, []);

  // Idle-session timeout.
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    if (!user) return;
    const bump = () => { lastActivity.current = Date.now(); };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current > settings.idleTimeoutMinutes * 60_000) {
        signOut(`Signed out after ${settings.idleTimeoutMinutes} minutes of inactivity.`);
      }
    }, 30_000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); window.clearInterval(timer); };
  }, [user, settings.idleTimeoutMinutes, signOut]);

  const value: AppState = {
    user, repo, settings, reviews, loading, authError, signOutReason,
    demoSignIn(name, role) {
      const u: AppUser = { id: `demo-${role}`, email: `${role}@demo.invalid`, name: name || 'Demo User', role, organizationId: 'demo-org', organizationName: 'Demo Aging Services (fictional)' };
      try { sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(u)); } catch { /* ignore */ }
      setSignOutReason('');
      setUser(u);
    },
    async emailSignIn(email, password) {
      if (!supabase) return;
      setAuthError('');
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) { setAuthError(error?.message ?? 'Sign-in failed'); return; }
      setSignOutReason('');
      const { data: p } = await supabase.from('profiles').select('full_name, role, organization_id, organizations(name)').eq('id', data.user.id).maybeSingle();
      if (!p) { setAuthError('Your account is not linked to an organization.'); await supabase.auth.signOut(); return; }
      const org = (p as unknown as { organizations: { name: string } | null }).organizations;
      setUser({ id: data.user.id, email, name: p.full_name || email, role: p.role as Role, organizationId: p.organization_id, organizationName: org?.name ?? '' });
    },
    signOut,
    refreshReviews,
    async persist(review, audit) {
      if (!user) throw new Error('Not signed in');
      await repo.saveReview(user, review);
      await repo.appendAudit(user, audit);
      setReviews((prev) => {
        const i = prev.findIndex((r) => r.id === review.id);
        if (i < 0) return [review, ...prev];
        const next = [...prev];
        next[i] = review;
        return next;
      });
    },
    async removeReview(id, audit) {
      if (!user) return;
      await repo.deleteReview(user, id);
      await repo.appendAudit(user, audit);
      setReviews((prev) => prev.filter((r) => r.id !== id));
    },
    async saveSettings(next, audit) {
      if (!user) return;
      await repo.saveSettings(user, next);
      await repo.appendAudit(user, audit);
      setSettings(next);
    },
    can(action) {
      const role = user?.role;
      if (action === 'configure' || action === 'delete') return role === 'admin' || role === 'supervisor';
      if (action === 'viewAudit') return role !== 'case_manager';
      return false;
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

export function useReview(id: string | undefined): ReviewRecord | null {
  const { reviews } = useApp();
  return reviews.find((r) => r.id === id) ?? null;
}
