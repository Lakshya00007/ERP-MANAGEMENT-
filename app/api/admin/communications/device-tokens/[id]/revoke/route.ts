import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { revokeDeviceToken } from "@/lib/communications/service";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { user } = await requireAdminApi();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await revokeDeviceToken({
      adminId: user.id,
      tokenId: id,
      reason: typeof body.reason === "string" ? body.reason : null,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
