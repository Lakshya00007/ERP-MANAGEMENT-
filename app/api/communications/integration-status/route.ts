import { withDeviceAuth } from "@/lib/communications/device-auth";
import { getSafeIntegrationStatus } from "@/lib/communications/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withDeviceAuth(request, getSafeIntegrationStatus);
}
