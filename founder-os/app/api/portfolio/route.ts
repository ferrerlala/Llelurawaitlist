import { guard, streamStructured } from "@/lib/claude";
import { portfolioPrompt } from "@/lib/engine";
import { PortfolioRequest } from "@/lib/requests";
import { PortfolioSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;

  const parsed = PortfolioRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ code: "invalid", message: "Add at least two companies first." }, { status: 400 });

  return streamStructured({
    schema: PortfolioSchema,
    prompt: portfolioPrompt(parsed.data.companies),
    effort: "high",
    maxTokens: 16000,
  });
}
