import { withDeviceAuth } from "@/lib/communications/device-auth";
import { createCommunicationBatch } from "@/lib/communications/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return withDeviceAuth(request, (context) => createCommunicationBatch(context, body));
}
