import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { jsonError, readBodyString, requireBodyString } from "@/lib/api";
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
    const action = requireBodyString(body, "action");
    const reason = readBodyString(body, "reason");
    const supabase = createSupabaseAdminClient();
    const { data: current, error: currentError } = await supabase
      .from("licenses")
      .select("license_id,status")
      .eq("license_id", licenseId)
      .maybeSingle<{ license_id: string; status: string }>();

    if (currentError) {
      throw new Error(currentError.message);
    }

    if (!current) {
      return NextResponse.json({ error: "License not found" }, { status: 404 });
    }

    if (action === "reactivate" && current.status === "Revoked") {
      return NextResponse.json({ error: "Revoked licenses cannot be reactivated" }, { status: 409 });
    }

    let update: Record<string, unknown>;
    let auditAction: string;

    if (action === "suspend") {
      if (!reason) {
        return NextResponse.json({ error: "Reason is required" }, { status: 400 });
      }
      update = { status: "Suspended", suspend_reason: reason };
      auditAction = "license.suspended";
    } else if (action === "revoke") {
      if (!reason) {
        return NextResponse.json({ error: "Reason is required" }, { status: 400 });
      }
      update = { status: "Revoked", revoked_reason: reason };
      auditAction = "license.revoked";
    } else if (action === "reactivate") {
      update = { status: "Active", suspend_reason: null };
      auditAction = "license.reactivated";
    } else {
      return NextResponse.json({ error: "Invalid license action" }, { status: 400 });
    }

    const { error } = await supabase.from("licenses").update(update).eq("license_id", licenseId);

    if (error) {
      throw new Error(error.message);
    }

    await writeAuditLog({
      actorId: user.id,
      action: auditAction,
      entityType: "license",
      entityId: licenseId,
      details: { previousStatus: current.status, ...update },
    });

    return NextResponse.json({ message: "License updated" });
  } catch (error) {
    return jsonError(error, 400);
  }
}
