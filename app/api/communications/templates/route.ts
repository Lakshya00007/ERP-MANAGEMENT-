import { withDeviceAuth } from "@/lib/communications/device-auth";
import { getTemplates } from "@/lib/communications/service";
import type { CommunicationChannel } from "@/lib/communications/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawChannel = url.searchParams.get("channel");
  const channel = rawChannel === "WhatsApp" || rawChannel === "SMS" ? (rawChannel as CommunicationChannel) : undefined;
  return withDeviceAuth(request, (context) => getTemplates(context, channel));
}
