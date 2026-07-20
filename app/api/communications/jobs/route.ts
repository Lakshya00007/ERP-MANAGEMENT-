import { withDeviceAuth } from "@/lib/communications/device-auth";
import { getJobs } from "@/lib/communications/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filter = {
    channel: url.searchParams.get("channel") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  };
  return withDeviceAuth(request, (context) => getJobs(context, filter));
}
