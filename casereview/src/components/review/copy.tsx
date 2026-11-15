// Clean copy and paste for WellSky: plain text only, no internal labels, no characters that paste badly.
import clsx from 'clsx';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/** Plain text that pastes cleanly into WellSky text boxes. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\[\[CLARIFY:[^\]]*\]\]/g, '')
    .replace(/[​-‍﻿]/g, '')
    .replace(/ /g, ' ')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Split a journal into its sections (blocks separated by a blank line; the first line is the heading). */
export function journalSections(text: string): { heading: string; body: string }[] {
  return cleanText(text).split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n');
    return { heading: lines[0].replace(/:$/, '').trim(), body: block };
  }).filter((s) => s.body.trim());
}

export async function copyText(raw: string): Promise<boolean> {
  const text = cleanText(raw);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback where the clipboard API is blocked (for example inside an embedded frame).
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

export function CopyButton({ text, label = 'Copy', big, className }: { text: string; label?: string; big?: boolean; className?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle');
  return (
    <button type="button" disabled={!text.trim()}
      onClick={async () => { setState((await copyText(text)) ? 'done' : 'fail'); setTimeout(() => setState('idle'), 2500); }}
      className={clsx('inline-flex shrink-0 items-center justify-center gap-1.5 font-medium disabled:opacity-40',
        big ? 'bg-navy-700 px-4 py-3 text-sm text-white hover:bg-navy-900' : 'border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 hover:bg-slate-50',
        state === 'done' && (big ? '!bg-emerald-700' : '!border-emerald-600 !text-emerald-800'), className)}>
      {state === 'done' ? <Check size={14} /> : <Copy size={14} />}
      <span aria-live="polite">{state === 'done' ? 'Copied' : state === 'fail' ? 'Copy blocked — select the text and copy' : label}</span>
    </button>
  );
}
