import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { saveTemplate } from "@/lib/communications/service";
import type { CommunicationChannel } from "@/lib/communications/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApi();
    const body = (await request.json()) as Record<string, unknown>;
    await saveTemplate({
      adminId: user.id,
      schoolId: String(body.schoolId ?? ""),
      channel: body.channel as CommunicationChannel,
      internalName: String(body.internalName ?? ""),
      category: typeof body.category === "string" ? body.category : null,
      providerTemplateId: typeof body.providerTemplateId === "string" ? body.providerTemplateId : null,
      providerTemplateName: typeof body.providerTemplateName === "string" ? body.providerTemplateName : null,
      providerLanguageCode: typeof body.providerLanguageCode === "string" ? body.providerLanguageCode : null,
      dltTemplateId: typeof body.dltTemplateId === "string" ? body.dltTemplateId : null,
      msg91FlowId: typeof body.msg91FlowId === "string" ? body.msg91FlowId : null,
      senderId: typeof body.senderId === "string" ? body.senderId : null,
      bodyPreview: typeof body.bodyPreview === "string" ? body.bodyPreview : null,
      variableDefinitions: body.variableDefinitions ?? [],
      status: typeof body.status === "string" ? body.status : "Draft",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
