import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AuditInput = {
  actorId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
};

export async function writeAuditLog(input: AuditInput) {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("audit_logs").insert({
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    details: input.details ?? {},
  });

  if (error) {
    throw new Error(`Audit log failed: ${error.message}`);
  }
}
