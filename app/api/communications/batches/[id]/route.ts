import { withDeviceAuth } from "@/lib/communications/device-auth";
import { getBatch } from "@/lib/communications/service";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  const { id } = await params;
  return withDeviceAuth(request, (context) => getBatch(context, id));
}
