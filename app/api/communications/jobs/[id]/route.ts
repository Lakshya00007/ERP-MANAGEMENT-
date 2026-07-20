import { withDeviceAuth } from "@/lib/communications/device-auth";
import { getJob } from "@/lib/communications/service";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  const { id } = await params;
  return withDeviceAuth(request, (context) => getJob(context, id));
}
