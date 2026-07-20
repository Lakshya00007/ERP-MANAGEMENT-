import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { jsonError, readBodyString, requireBodyString } from "@/lib/api";
import { getDb, queryOne } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ licenseId: string }>;
};

type LicenseStatusRow = {
  license_id: string;
  status: string;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user } = await requireAdminApi();
    const { licenseId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = requireBodyString(body, "action");
    const reason = readBodyString(body, "reason");
    const current = await queryOne<LicenseStatusRow>(
      `select license_id, status
       from licenses
       where license_id = $1`,
      [licenseId],
    );

    if (!current) {
      return NextResponse.json({ error: "License not found" }, { status: 404 });
    }

    if (action === "reactivate" && current.status === "Revoked") {
      return NextResponse.json({ error: "Revoked licenses cannot be reactivated" }, { status: 409 });
    }

    let updateStatus: "Active" | "Suspended" | "Revoked";
    let suspendReason: string | null | undefined;
    let revokedReason: string | null | undefined;
    let auditAction: string;

    if (action === "suspend") {
      if (!reason) {
        return NextResponse.json({ error: "Reason is required" }, { status: 400 });
      }
      updateStatus = "Suspended";
      suspendReason = reason;
      auditAction = "license.suspended";
    } else if (action === "revoke") {
      if (!reason) {
        return NextResponse.json({ error: "Reason is required" }, { status: 400 });
      }
      updateStatus = "Revoked";
      revokedReason = reason;
      auditAction = "license.revoked";
    } else if (action === "reactivate") {
      updateStatus = "Active";
      suspendReason = null;
      auditAction = "license.reactivated";
    } else {
      return NextResponse.json({ error: "Invalid license action" }, { status: 400 });
    }

    const details = {
      previousStatus: current.status,
      status: updateStatus,
      suspend_reason: suspendReason,
      revoked_reason: revokedReason,
    };
    const db = getDb();
    await db.transaction((tx) => {
      const update =
        action === "suspend"
          ? tx`
              update licenses
              set status = ${updateStatus},
                  suspend_reason = ${suspendReason}
              where license_id = ${licenseId}
            `
          : action === "revoke"
            ? tx`
                update licenses
                set status = ${updateStatus},
                    revoked_reason = ${revokedReason}
                where license_id = ${licenseId}
              `
            : tx`
                update licenses
                set status = ${updateStatus},
                    suspend_reason = ${null}
                where license_id = ${licenseId}
              `;

      return [
        update,
        tx`
          insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
          values (
            ${randomUUID()}, ${user.id}, ${auditAction}, ${"license"}, ${licenseId},
            ${JSON.stringify(details)}::jsonb
          )
        `,
      ];
    });

    return NextResponse.json({ message: "License updated" });
  } catch (error) {
    return jsonError(error, 400);
  }
}
