// Demo-mode repository: stores data in this browser only, namespaced by organization.
// Intended for fictional test data. Not a substitute for the secured Supabase backend.

import { defaultSettings } from './default-settings.ts';
import type { Repository } from './repository.ts';
import type { AppUser, AuditEntry, OrgSettings, ReviewRecord } from './types.ts';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

function safeStore(): KeyValueStore {
  try {
    const s = globalThis.localStorage;
    s.setItem('__cr_probe', '1');
    s.removeItem('__cr_probe');
    return s;
  } catch {
    return new MemoryStore();
  }
}

export class LocalRepository implements Repository {
  readonly kind = 'local-demo' as const;
  constructor(private store: KeyValueStore = safeStore()) {}

  private key(user: AppUser, what: string) {
    return `casereview:${user.organizationId}:${what}`;
  }
  private read<T>(k: string, fallback: T): T {
    try {
      const raw = this.store.getItem(k);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }
  private write(k: string, v: unknown) {
    this.store.setItem(k, JSON.stringify(v));
  }

  async listReviews(user: AppUser) {
    return this.read<ReviewRecord[]>(this.key(user, 'reviews'), []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async getReview(user: AppUser, id: string) {
    return (await this.listReviews(user)).find((r) => r.id === id) ?? null;
  }
  async saveReview(user: AppUser, review: ReviewRecord) {
    if (review.organizationId !== user.organizationId) throw new Error('Organization mismatch');
    const list = await this.listReviews(user);
    const idx = list.findIndex((r) => r.id === review.id);
    const next = { ...review, updatedAt: new Date().toISOString() };
    if (idx >= 0) list[idx] = next;
    else list.push(next);
    this.write(this.key(user, 'reviews'), list);
  }
  async deleteReview(user: AppUser, id: string) {
    this.write(this.key(user, 'reviews'), (await this.listReviews(user)).filter((r) => r.id !== id));
  }
  async getSettings(user: AppUser): Promise<OrgSettings> {
    const saved = this.read<Partial<OrgSettings> | null>(this.key(user, 'settings'), null);
    return { ...defaultSettings(), ...(saved ?? {}) };
  }
  async saveSettings(user: AppUser, settings: OrgSettings) {
    this.write(this.key(user, 'settings'), settings);
  }
  async appendAudit(user: AppUser, entries: AuditEntry[]) {
    const list = this.read<AuditEntry[]>(this.key(user, 'audit'), []);
    this.write(this.key(user, 'audit'), [...list, ...entries]);
  }
  async listAudit(user: AppUser, reviewId?: string) {
    const list = this.read<AuditEntry[]>(this.key(user, 'audit'), []);
    return (reviewId ? list.filter((e) => e.reviewId === reviewId) : list).sort((a, b) => b.at.localeCompare(a.at));
  }
  async purgeExpired(user: AppUser, retentionDays: number) {
    const cutoff = Date.now() - retentionDays * 86_400_000;
    const list = await this.listReviews(user);
    const keep = list.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
    this.write(this.key(user, 'reviews'), keep);
    return list.length - keep.length;
  }
}
