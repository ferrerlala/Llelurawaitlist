import type { AppUser, AuditEntry, OrgSettings, ReviewRecord } from './types.ts';

/** Storage abstraction. Implementations: LocalRepository (demo) and SupabaseRepository. */
export interface Repository {
  readonly kind: 'local-demo' | 'supabase';
  listReviews(user: AppUser): Promise<ReviewRecord[]>;
  getReview(user: AppUser, id: string): Promise<ReviewRecord | null>;
  saveReview(user: AppUser, review: ReviewRecord): Promise<void>;
  deleteReview(user: AppUser, id: string): Promise<void>;
  getSettings(user: AppUser): Promise<OrgSettings>;
  saveSettings(user: AppUser, settings: OrgSettings): Promise<void>;
  appendAudit(user: AppUser, entries: AuditEntry[]): Promise<void>;
  listAudit(user: AppUser, reviewId?: string): Promise<AuditEntry[]>;
  /** Deletes reviews older than the retention period. Returns the number deleted. */
  purgeExpired(user: AppUser, retentionDays: number): Promise<number>;
}

export function newId(prefix = ''): string {
  const c = globalThis.crypto;
  const id = c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}_${id}` : id;
}
