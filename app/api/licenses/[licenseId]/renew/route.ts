import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { jsonError, normalizeDateInput, readBodyString } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ licenseId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user } = await requireAdminApi();
    const { licenseId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const expiresAt = normalizeDateInput(readBodyString(body, "expiresAt"));
    const supabase = createSupabaseAdminClient();
    const update: Record<string, unknown> = { expires_at: expiresAt };

    if (expiresAt && new Date(expiresAt).getTime() >= Date.now()) {
      update.status = "Active";
    }

    const { error } = await supabase.from("licenses").update(update).eq("license_id", licenseId);

    if (error) {
      throw new Error(error.message);
    }

    await writeAuditLog({
      actorId: user.id,
      action: "license.renewed",
      entityType: "license",
      entityId: licenseId,
      details: { expiresAt },
    });

    return NextResponse.json({ message: "License expiry updated" });
  } catch (error) {
    return jsonError(error, 400);
  }
}
