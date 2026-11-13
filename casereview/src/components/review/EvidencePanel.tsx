import { Quote } from 'lucide-react';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { normalizeForMatch } from '@shared/extraction-contract.ts';
import { formatLocation } from '../../engine/assessment-parser.ts';
import type { EvidenceRef, SourceDocument } from '../../engine/types.ts';
import { Drawer, Notice } from '../ui.tsx';

interface EvidenceRequest { title: string; evidence: EvidenceRef[]; note?: string }
const Ctx = createContext<(r: EvidenceRequest) => void>(() => {});

export function EvidenceProvider({ documents, children }: { documents: SourceDocument[]; children: ReactNode }) {
  const [req, setReq] = useState<EvidenceRequest | null>(null);
  return (
    <Ctx.Provider value={setReq}>
      {children}
      <Drawer open={!!req} onClose={() => setReq(null)} title={<span>Evidence · {req?.title}</span>}>
        {req && <EvidenceBody req={req} documents={documents} />}
      </Drawer>
    </Ctx.Provider>
  );
}

function EvidenceBody({ req, documents }: { req: EvidenceRequest; documents: SourceDocument[] }) {
  if (!req.evidence.length) {
    return <Notice tone="slate" title="No supporting text found">{req.note ?? 'The submitted documentation contains no statement supporting this item. It must be verified and documented — it has not been assumed.'}</Notice>;
  }
  const byDoc = new Map<string, EvidenceRef[]>();
  for (const e of req.evidence) {
    const k = e.location?.docId ?? 'unknown';
    byDoc.set(k, [...(byDoc.get(k) ?? []), e]);
  }
  return (
    <div className="space-y-5">
      {req.note && <p className="text-sm text-slate-600">{req.note}</p>}
      <ul className="space-y-2">
        {req.evidence.map((e, i) => (
          <li key={i} className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="flex gap-2 text-sm text-slate-900"><Quote size={14} className="mt-0.5 shrink-0 text-amber-700" /> {e.text}</p>
            <p className="mt-1 text-xs text-slate-600">{formatLocation(e.location)}</p>
          </li>
        ))}
      </ul>
      {[...byDoc.entries()].map(([docId, refs]) => {
        const doc = documents.find((d) => d.id === docId);
        if (!doc) return null;
        const lines = new Set(refs.map((r) => r.location?.line).filter((n): n is number => !!n));
        const needles = refs.map((r) => normalizeForMatch(r.text).replace(/[.;,]+$/, ''));
        let scrolled = false;
        return (
          <div key={docId}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Source: {doc.name} ({doc.type})</p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700">
              {doc.text.split(/\r?\n/).map((line, i) => {
                const hit = lines.has(i + 1) || needles.some((n) => n && normalizeForMatch(line).includes(n));
                const scrollHere = hit && !scrolled;
                if (scrollHere) scrolled = true;
                return (
                  <div key={i} className={hit ? 'rounded bg-amber-200/70' : undefined} ref={scrollHere ? (el) => { el?.scrollIntoView({ block: 'center' }); } : undefined}>
                    <span className="mr-2 inline-block w-6 select-none text-right text-slate-400">{i + 1}</span>{line}
                  </div>
                );
              })}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

export function useEvidence() {
  return useContext(Ctx);
}

export function EvidenceButton({ title, evidence, note }: EvidenceRequest) {
  const open = useEvidence();
  return (
    <button type="button" onClick={() => open({ title, evidence, note })}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium text-navy-700 ring-1 ring-navy-200 hover:bg-navy-50">
      <Quote size={11} /> {evidence.length ? `Evidence (${evidence.length})` : 'No evidence'}
    </button>
  );
}
