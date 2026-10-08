import { guard, streamStructured } from "@/lib/claude";
import { analysisPrompt } from "@/lib/engine";
import { AnalyzeRequest } from "@/lib/requests";
import { AnalysisSchemas } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;

  const parsed = AnalyzeRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "invalid", message: "Invalid request." }, { status: 400 });

  const { mode, input, company, others } = parsed.data;
  return streamStructured({
    schema: AnalysisSchemas[mode],
    prompt: analysisPrompt(mode, input, company, others),
    effort: "high",
  });
}
