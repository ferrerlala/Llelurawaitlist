/** Detect partial participant names such as "Linda L." or names flagged as incomplete. */
export function incompleteNames(participants: string): string[] {
  const out: string[] = [];
  const cleaned = participants.replace(/\(full name not (?:supplied|provided|given)\)/gi, ' [INCOMPLETE] ');
  for (const raw of cleaned.split(/,|;|\band\b|&/)) {
    let part = raw.trim();
    if (!part) continue;
    const flagged = /\[INCOMPLETE\]/.test(part);
    part = part.replace(/\[INCOMPLETE\]/g, '').trim();
    // Strip role prefixes like "HC RN:", "RN", "Supervisor".
    const namePart = part.includes(':') ? part.split(':').slice(1).join(':').trim() : part.replace(/^(?:hc\s+)?(?:rn|cm|lpn|lcsw|ot|pt|supervisor|case manager|nurse)\b\s*/i, '').trim();
    if (!namePart) { out.push(part); continue; }
    const tokens = namePart.split(/\s+/).filter(Boolean);
    const last = tokens[tokens.length - 1] ?? '';
    const partial = tokens.length < 2 || /^[A-Z]\.?$/.test(last);
    if (flagged || partial) out.push(namePart.replace(/\s+/g, ' '));
  }
  return [...new Set(out)];
}

