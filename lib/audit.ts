import "server-only";

import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";

type AuditInput = {
  actorId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
};

export async function writeAuditLog(input: AuditInput) {
  await sql`
    insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
    values (
      ${randomUUID()},
      ${input.actorId},
      ${input.action},
      ${input.entityType ?? null},
      ${input.entityId ?? null},
      ${JSON.stringify(input.details ?? {})}::jsonb
    )
  `;
}
