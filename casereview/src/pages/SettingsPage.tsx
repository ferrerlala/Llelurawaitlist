import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext.tsx';
import { checkAiStatus, resolveClaudeEndpoint, type AiStatus } from '../ai/providers.ts';
import { Badge, Button, Card, Input, Label, Notice, PageHeader, Select, Table, Td, TextArea, Th } from '../components/ui.tsx';
import { defaultSettings } from '../data/default-settings.ts';
import { audit } from '../data/review-actions.ts';
import type { AuditEntry, OrgSettings } from '../data/types.ts';
import { EVALUATOR_IDS } from '../engine/qa-checklist-engine.ts';
import type { CdsTemplate, QaChecklist } from '../engine/types.ts';
import type { FunctionalAreaDef } from '@shared/fact-catalog.ts';
import { buildFactCatalog } from '@shared/fact-catalog.ts';

type JsonKind = 'cdsTemplate' | 'qaChecklist' | 'functionalAreas';

function validateConfig(kind: JsonKind, value: unknown, areas: FunctionalAreaDef[]): string | null {
  if (kind === 'cdsTemplate') {
    const t = value as CdsTemplate;
    if (!t?.id || !t.version || !Array.isArray(t.fields)) return 'Template needs id, version and fields[]';
    const keys = new Set(buildFactCatalog(areas).map((k) => k.key));
    for (const f of t.fields) {
      if (!f.id || !f.section || !f.label || !Array.isArray(f.factKeys) || !Array.isArray(f.choices)) return `Field ${f.id ?? '?'} needs id, section, label, factKeys[] and choices[]`;
      const bad = f.factKeys.filter((k) => !keys.has(k));
      if (bad.length) return `Field ${f.id} references unknown fact keys: ${bad.join(', ')}`;
    }
  }
  if (kind === 'qaChecklist') {
    const c = value as QaChecklist;
    if (!c?.id || !c.version || !Array.isArray(c.categories)) return 'Checklist needs id, version and categories[]';
    for (const cat of c.categories) {
      if (!cat.id || typeof cat.number !== 'number' || !cat.title || !Array.isArray(cat.requirements) || !Array.isArray(cat.requiredRecords)) return `Category ${cat.id ?? '?'} is incomplete`;
      if (!EVALUATOR_IDS.includes(cat.evaluator)) return `Category ${cat.id}: unknown evaluator "${cat.evaluator}". Available: ${EVALUATOR_IDS.join(', ')}`;
    }
  }
  if (kind === 'functionalAreas') {
    if (!Array.isArray(value)) return 'Expected an array of functional areas';
    for (const a of value as FunctionalAreaDef[]) {
      if (!a.id || !a.label || !['ADL', 'IADL', 'Support'].includes(a.type) || !Array.isArray(a.synonyms)) return `Area ${a.id ?? '?'} needs id, label, type (ADL|IADL|Support) and synonyms[]`;
    }
  }
  return null;
}

function JsonEditor({ kind, title, description, settings, canEdit, onSave }: { kind: JsonKind; title: string; description: string; settings: OrgSettings; canEdit: boolean; onSave: (next: OrgSettings, summary: string) => Promise<void> }) {
  const [text, setText] = useState(JSON.stringify(settings[kind], null, 2));
  const [msg, setMsg] = useState<{ tone: 'red' | 'green'; text: string } | null>(null);
  useEffect(() => setText(JSON.stringify(settings[kind], null, 2)), [settings, kind]);
  const versionOf = (v: unknown) => (v as { version?: string })?.version;
  return (
    <Card title={title} subtitle={description} actions={versionOf(settings[kind]) && <Badge tone="blue">v{versionOf(settings[kind])}</Badge>}>
      <TextArea rows={14} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} readOnly={!canEdit} spellCheck={false} />
      {msg && <Notice tone={msg.tone} className="mt-2">{msg.text}</Notice>}
      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={async () => {
            let parsed: unknown;
            try { parsed = JSON.parse(text); } catch (e) { setMsg({ tone: 'red', text: `Invalid JSON: ${(e as Error).message}` }); return; }
            const err = validateConfig(kind, parsed, kind === 'functionalAreas' ? (parsed as FunctionalAreaDef[]) : settings.functionalAreas);
            if (err) { setMsg({ tone: 'red', text: err }); return; }
            const prevVersion = versionOf(settings[kind]);
            if (prevVersion && versionOf(parsed) === prevVersion && JSON.stringify(parsed) !== JSON.stringify(settings[kind])) {
              setMsg({ tone: 'red', text: 'Change the "version" value when editing so existing reviews keep a traceable configuration version.' });
              return;
            }
            await onSave({ ...settings, [kind]: parsed }, `${kind}${versionOf(parsed) ? `@${versionOf(parsed)}` : ''}`);
            setMsg({ tone: 'green', text: 'Saved. New analyses will use this configuration; existing reviews keep the version they were analyzed with.' });
          }}>Validate &amp; save</Button>
          <Button size="sm" variant="ghost" onClick={() => setText(JSON.stringify(defaultSettings()[kind], null, 2))}>Load default</Button>
        </div>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const { settings, saveSettings, user, can, repo } = useApp();
  const canEdit = can('configure');
  const [draft, setDraft] = useState(settings);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [purgeMsg, setPurgeMsg] = useState('');
  const [orgAudit, setOrgAudit] = useState<AuditEntry[]>([]);
  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => { if (user && can('viewAudit')) repo.listAudit(user).then((e) => setOrgAudit(e.slice(0, 50))).catch(() => {}); }, [user, repo, can, settings]);
  if (!user) return null;

  const save = (next: OrgSettings, summary: string) => saveSettings(next, [audit(user, null, 'settings.updated', 'settings', user.organizationId, null, summary)]);

  return (
    <>
      <PageHeader title="Settings" description="Organization configuration. Official CDS and QA requirements are configurable and versioned; nothing organization-specific is hard-coded into AI prompts." />
      {!canEdit && <Notice tone="slate" className="mb-4">Read-only: only Supervisors and Program Administrators can change settings.</Notice>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="AI provider" subtitle="Stage A extraction provider. Validation, QA and reporting always run in the deterministic engine.">
          <div className="space-y-3">
            <div>
              <Label htmlFor="mode">Mode</Label>
              <Select id="mode" disabled={!canEdit} value={draft.aiMode} onChange={(e) => setDraft({ ...draft, aiMode: e.target.value as OrgSettings['aiMode'] })}>
                <option value="mock">Mock AI mode (rule-based, no external service)</option>
                <option value="claude">Claude (Anthropic) via server endpoint</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="ep">Claude endpoint (optional override)</Label>
              <Input id="ep" disabled={!canEdit} value={draft.aiEndpoint} onChange={(e) => setDraft({ ...draft, aiEndpoint: e.target.value })} placeholder={resolveClaudeEndpoint({ ...draft, aiEndpoint: '' })} />
              <p className="mt-1 text-xs text-slate-500">The API key is configured on the server only (ANTHROPIC_API_KEY) and is never sent to the browser.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={async () => setStatus(await checkAiStatus(draft))}>Check AI endpoint</Button>
              {canEdit && <Button size="sm" variant="primary" onClick={() => save(draft, `aiMode=${draft.aiMode}`)}>Save provider settings</Button>}
            </div>
            {status && <Notice tone={status.configured ? 'green' : 'amber'}>{status.message}</Notice>}
            <Notice tone="red" title="Real consumer data">Do not send real consumer information to an external AI service until your organization has approved it, a security assessment is complete, and a Business Associate Agreement with the AI provider is in place. Until then, every Claude request requires a fictional-data attestation.</Notice>
          </div>
        </Card>

        <Card title="Security, sessions and retention">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="ret">Retention period (days)</Label><Input id="ret" type="number" min={1} disabled={!canEdit} value={draft.retentionDays} onChange={(e) => setDraft({ ...draft, retentionDays: Number(e.target.value) })} /></div>
            <div><Label htmlFor="idle">Idle sign-out (minutes)</Label><Input id="idle" type="number" min={1} max={240} disabled={!canEdit} value={draft.idleTimeoutMinutes} onChange={(e) => setDraft({ ...draft, idleTimeoutMinutes: Number(e.target.value) })} /></div>
          </div>
          {canEdit && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => save(draft, `retentionDays=${draft.retentionDays}; idle=${draft.idleTimeoutMinutes}`)}>Save</Button>
              <Button size="sm" variant="danger" onClick={async () => {
                const n = await repo.purgeExpired(user, draft.retentionDays);
                await repo.appendAudit(user, [audit(user, null, 'retention.purge', 'reviews', user.organizationId, null, `${n} deleted`)]);
                setPurgeMsg(`${n} review(s) older than ${draft.retentionDays} days deleted.`);
              }}>Purge expired reviews now</Button>
            </div>
          )}
          {purgeMsg && <Notice tone="blue" className="mt-2">{purgeMsg}</Notice>}
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-slate-600">
            <li>Storage: {repo.kind === 'supabase' ? 'Supabase PostgreSQL with row-level security per organization' : 'Local demo storage in this browser (fictional data only)'}.</li>
            <li>Application logs never include document text; AI endpoints log only status codes.</li>
            <li>No analytics or third-party error tracking is included.</li>
            <li>Sessions are stored per browser tab and end on sign-out, tab close or idle timeout.</li>
          </ul>
        </Card>

        <div className="lg:col-span-2">
          <JsonEditor kind="cdsTemplate" title="CDS template and field mappings" settings={settings} canEdit={canEdit} onSave={save}
            description="Replace the provisional mapping with the official Massachusetts CDS instrument, field names and answer choices. factKeys link fields to the extraction catalog." />
        </div>
        <div className="lg:col-span-2">
          <JsonEditor kind="qaChecklist" title="Annual QA checklist (versioned)" settings={settings} canEdit={canEdit} onSave={save}
            description={`Requirement text, priority, required records, parameters and enabled state are editable. Evaluators: ${EVALUATOR_IDS.join(', ')}.`} />
        </div>
        <div className="lg:col-span-2">
          <JsonEditor kind="functionalAreas" title="ADL/IADL categories" settings={settings} canEdit={canEdit} onSave={save}
            description="Functional areas compared between narrative and CDS, with the phrases used to recognize them." />
        </div>

        {can('viewAudit') && (
          <div className="lg:col-span-2">
            <Card title="Organization audit log (latest 50)">
              <Table>
                <thead><tr><Th>When</Th><Th>User</Th><Th>Action</Th><Th>Item</Th><Th>Change</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {orgAudit.map((e) => (
                    <tr key={e.id}><Td className="whitespace-nowrap text-xs">{new Date(e.at).toLocaleString()}</Td><Td className="text-xs">{e.userName}</Td><Td className="text-xs font-medium">{e.action}</Td><Td className="text-xs">{e.entityType}</Td><Td className="max-w-md text-xs">{e.after}</Td></tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
