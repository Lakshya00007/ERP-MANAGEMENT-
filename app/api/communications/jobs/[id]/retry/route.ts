import { withDeviceAuth } from "@/lib/communications/device-auth";
import { retryJob } from "@/lib/communications/service";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const role = typeof body.requestedByRole === "string" ? body.requestedByRole : "";
  return withDeviceAuth(request, (context) => retryJob(context, id, role));
}
