import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { testIntegration } from "@/lib/communications/service";
import type { CommunicationChannel } from "@/lib/communications/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApi();
    const body = (await request.json()) as Record<string, unknown>;
    const result = await testIntegration({
      adminId: user.id,
      schoolId: String(body.schoolId ?? ""),
      channel: body.channel as CommunicationChannel,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error, 400);
  }
}
