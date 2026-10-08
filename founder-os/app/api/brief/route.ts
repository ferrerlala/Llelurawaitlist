import { guard, streamStructured } from "@/lib/claude";
import { briefPrompt } from "@/lib/engine";
import { BriefRequest } from "@/lib/requests";
import { BriefSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;

  const parsed = BriefRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "invalid", message: "Invalid request." }, { status: 400 });

  return streamStructured({
    schema: BriefSchema,
    prompt: briefPrompt(parsed.data.company, parsed.data.others),
    effort: "medium",
    maxTokens: 16000,
  });
}
