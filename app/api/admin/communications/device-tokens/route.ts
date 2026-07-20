import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { generateDeviceToken } from "@/lib/communications/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApi();
    const body = (await request.json()) as Record<string, unknown>;
    const result = await generateDeviceToken({
      adminId: user.id,
      schoolId: String(body.schoolId ?? ""),
      deviceId: String(body.deviceId ?? ""),
      licenseId: String(body.licenseId ?? ""),
      expiresAt: typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : null,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error, 400);
  }
}
