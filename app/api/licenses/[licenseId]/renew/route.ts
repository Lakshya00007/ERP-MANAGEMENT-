import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { jsonError, normalizeDateInput, readBodyString } from "@/lib/api";
import { getDb, queryOne } from "@/lib/db";

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
    const current = await queryOne<{ license_id: string }>(
      `select license_id
       from licenses
       where license_id = $1`,
      [licenseId],
    );

    if (!current) {
      return NextResponse.json({ error: "License not found" }, { status: 404 });
    }

    const nextStatus = expiresAt && new Date(expiresAt).getTime() >= Date.now() ? "Active" : null;
    const db = getDb();
    await db.transaction((tx) => [
      tx`
        update licenses
        set expires_at = ${expiresAt},
            status = coalesce(${nextStatus}, status)
        where license_id = ${licenseId}
      `,
      tx`
        insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
        values (
          ${randomUUID()}, ${user.id}, ${"license.renewed"}, ${"license"}, ${licenseId},
          ${JSON.stringify({ expiresAt })}::jsonb
        )
      `,
    ]);

    return NextResponse.json({ message: "License expiry updated" });
  } catch (error) {
    return jsonError(error, 400);
  }
}
