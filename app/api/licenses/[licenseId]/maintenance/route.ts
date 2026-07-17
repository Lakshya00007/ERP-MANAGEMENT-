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
    const maintenanceUntil = normalizeDateInput(readBodyString(body, "maintenanceUntil"));
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("licenses")
      .update({ maintenance_until: maintenanceUntil })
      .eq("license_id", licenseId);

    if (error) {
      throw new Error(error.message);
    }

    await writeAuditLog({
      actorId: user.id,
      action: "license.maintenance_extended",
      entityType: "license",
      entityId: licenseId,
      details: { maintenanceUntil },
    });

    return NextResponse.json({ message: "Maintenance date updated" });
  } catch (error) {
    return jsonError(error, 400);
  }
}
