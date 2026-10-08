import { MODEL, missingCredentials } from "@/lib/claude";

export const runtime = "nodejs";

export function GET() {
  return Response.json({
    ready: !missingCredentials(),
    model: MODEL,
    passcode: Boolean(process.env.FOUNDER_OS_PASSCODE),
  });
}
