import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { ENGINE_DOCTRINE } from "./engine";

export const MODEL = process.env.FOUNDER_OS_MODEL || "claude-opus-5-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** Events streamed to the browser as NDJSON lines. */
export type EngineEvent =
  | { type: "phase"; phase: "thinking" | "writing" }
  | { type: "delta"; text: string }
  | { type: "result"; data: unknown }
  | { type: "error"; message: string; code?: string };

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export function missingCredentials() {
  return !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN;
}

export function checkPasscode(req: Request): boolean {
  const required = process.env.FOUNDER_OS_PASSCODE;
  if (!required) return true;
  return req.headers.get("x-founder-passcode") === required;
}

function describeError(err: unknown): { message: string; code: string } {
  if (err instanceof Anthropic.AuthenticationError)
    return { code: "auth", message: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY." };
  if (err instanceof Anthropic.RateLimitError)
    return { code: "rate_limit", message: "Rate limited by the model provider. Try again in a moment." };
  if (err instanceof Anthropic.BadRequestError) return { code: "bad_request", message: err.message };
  if (err instanceof Anthropic.APIError)
    return { code: "api", message: `Model API error${err.status ? ` (${err.status})` : ""}: ${err.message}` };
  if (err instanceof Error) return { code: "internal", message: err.message };
  return { code: "internal", message: "Unknown error" };
}

/**
 * Run one structured engine call and stream progress as NDJSON.
 * The final line is either a `result` (schema-validated) or an `error`.
 */
export function streamStructured<S extends z.ZodType>(opts: {
  schema: S;
  prompt: string;
  effort?: Effort;
  maxTokens?: number;
}): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: EngineEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));

      try {
        const stream = getClient().beta.messages.stream({
          model: MODEL,
          max_tokens: opts.maxTokens ?? 32000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: opts.effort ?? "high", format: betaZodOutputFormat(opts.schema) },
          // The doctrine is identical across every call, so it is the cacheable prefix.
          system: [{ type: "text", text: ENGINE_DOCTRINE, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: opts.prompt }],
        });

        let lastPhase = "";
        for await (const event of stream) {
          if (event.type === "content_block_start") {
            const phase = event.content_block.type === "thinking" ? "thinking" : "writing";
            if (phase !== lastPhase) {
              lastPhase = phase;
              send({ type: "phase", phase });
            }
          } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            send({ type: "delta", text: event.delta.text });
          }
        }

        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          send({
            type: "error",
            code: "refusal",
            message: "The engine declined this request. Try rephrasing the question.",
          });
          return;
        }
        if (final.stop_reason === "max_tokens") {
          send({ type: "error", code: "truncated", message: "The analysis ran out of room. Try a narrower question." });
          return;
        }

        const text = final.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        const raw: unknown = JSON.parse(text);
        const parsed = opts.schema.safeParse(raw);
        if (parsed.success) {
          send({ type: "result", data: parsed.data });
        } else if (raw && typeof raw === "object") {
          // Structured outputs guarantee shape and required fields; the SDK's zod helper
          // relaxes enums to descriptions, so tolerate an off-list label rather than
          // discarding a complete analysis. The UI renders unknown labels neutrally.
          console.warn("[founder-os] schema drift:", parsed.error.issues.slice(0, 5));
          send({ type: "result", data: raw });
        } else {
          send({ type: "error", code: "schema", message: "The engine returned an incomplete analysis. Please retry." });
        }
      } catch (err) {
        send({ type: "error", ...describeError(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export function guard(req: Request): Response | null {
  if (!checkPasscode(req)) return Response.json({ code: "passcode", message: "Passcode required." }, { status: 401 });
  if (missingCredentials())
    return Response.json(
      {
        code: "no_key",
        message: "No model credentials configured. Add ANTHROPIC_API_KEY to founder-os/.env.local and restart.",
      },
      { status: 503 },
    );
  return null;
}
