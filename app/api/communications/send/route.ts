import { withDeviceAuth } from "@/lib/communications/device-auth";
import { createCommunicationJob } from "@/lib/communications/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return withDeviceAuth(request, (context) => createCommunicationJob(context, body));
}
