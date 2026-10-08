"use client";

import type { Mode } from "./schemas";
import type { Company, CompanyContext, PortfolioEntry } from "./types";

export class EngineError extends Error {
  constructor(
    message: string,
    public code: string = "internal",
  ) {
    super(message);
  }
}

const PASSCODE_KEY = "founder-os:passcode";

export function getPasscode() {
  try {
    return localStorage.getItem(PASSCODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPasscode(value: string) {
  try {
    localStorage.setItem(PASSCODE_KEY, value);
  } catch {
    /* storage unavailable */
  }
}

/** POST to an engine endpoint and consume its NDJSON stream. */
export async function callEngine<T>(
  path: "/api/analyze" | "/api/brief" | "/api/portfolio",
  body: unknown,
  handlers: { onDelta?: (text: string) => void; onPhase?: (phase: "thinking" | "writing") => void } = {},
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-founder-passcode": getPasscode() },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ message: `Request failed (${res.status})`, code: "http" }));
    throw new EngineError(err.message, err.code);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | null = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.type === "delta") handlers.onDelta?.(event.text);
      else if (event.type === "phase") handlers.onPhase?.(event.phase);
      else if (event.type === "result") result = event.data as T;
      else if (event.type === "error") throw new EngineError(event.message, event.code);
    }
  }

  if (!result) throw new EngineError("The engine stopped before finishing. Please retry.", "incomplete");
  return result;
}

export function toContext(c: Company): CompanyContext {
  return {
    name: c.name,
    profile: c.profile,
    metrics: c.metrics.slice(0, 20).map(({ label, value }) => ({ label, value })),
    decisions: c.decisions.slice(0, 12).map(({ date, title, decision }) => ({ date, title, decision })),
    experiments: c.experiments.slice(0, 12).map(({ title, status, result }) => ({ title, status, result })),
    assumptions: c.assumptions.slice(0, 15).map(({ text, status }) => ({ text, status })),
    ideas: c.ideas.slice(0, 15).map((i) => i.text),
    openActions: c.actions.filter((a) => !a.done).slice(0, 12).map((a) => a.text),
    recentQuestions: c.sessions.slice(0, 5).map((s) => ({
      date: s.date.slice(0, 10),
      mode: s.mode,
      input: s.input.slice(0, 600),
      answer: s.result.answer,
    })),
    readiness: c.brief?.readiness.overall ?? null,
  };
}

export function toPortfolioEntry(c: Company): PortfolioEntry {
  const p = c.profile;
  return {
    name: c.name,
    oneLiner: p.oneLiner,
    industry: p.industry,
    products: p.products,
    customers: p.customers,
    technology: p.technology,
    businessModel: p.businessModel,
  };
}

export const MODE_META: Record<Mode, { label: string; hint: string; placeholder: string }> = {
  think: {
    label: "Think",
    hint: "Full engine. Any strategic question.",
    placeholder: "What are you thinking about?",
  },
  decide: {
    label: "Decide",
    hint: "Compare options. Get one recommendation.",
    placeholder: "I have two options: …",
  },
  build: {
    label: "Build",
    hint: "Turn an idea into a ruthless build plan.",
    placeholder: "I want to build …",
  },
  grow: {
    label: "Grow",
    hint: "Find the bottleneck and the next experiment.",
    placeholder: "We're at … and growth has stalled because …",
  },
  opportunity: {
    label: "Opportunity",
    hint: "Is it real? How big? Scored 0–100.",
    placeholder: "I think there is an opportunity in …",
  },
  challenge: {
    label: "Challenge me",
    hint: "Stress-test your assumptions. Direct.",
    placeholder: "Here's my plan. Tear it apart: …",
  },
};
