import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { saveIntegration } from "@/lib/communications/service";
import type { CommunicationChannel, CommunicationProvider } from "@/lib/communications/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApi();
    const body = (await request.json()) as Record<string, unknown>;
    await saveIntegration({
      adminId: user.id,
      schoolId: String(body.schoolId ?? ""),
      channel: body.channel as CommunicationChannel,
      provider: body.provider as CommunicationProvider,
      status: String(body.status ?? "Configured"),
      config: (body.config ?? {}) as Record<string, unknown>,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
