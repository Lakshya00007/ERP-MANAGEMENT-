import { formatDateTime } from "@/lib/format";
import { queryRows } from "@/lib/db";
import type { AuditLog } from "@/lib/types";

export const dynamic = "force-dynamic";

type AuditLogWithActor = AuditLog & {
  actor_email: string | null;
  actor_name: string | null;
};

export default async function AuditLogsPage() {
  const logs = await queryRows<AuditLogWithActor>(
    `select
       a.*,
       u.email as actor_email,
       u.full_name as actor_name
     from audit_logs a
     left join admin_users u on u.id = a.actor_id
     order by a.created_at desc
     limit 250`,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Audit Logs</h1>
        <p className="text-sm text-slate-500">Immutable admin action history for licensing, schools, devices, and payments.</p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3">{formatDateTime(log.created_at)}</td>
                  <td className="px-4 py-3 font-semibold">{log.action}</td>
                  <td className="px-4 py-3">
                    <div>{log.entity_type ?? "system"}</div>
                    <div className="font-mono text-xs text-slate-500">{log.entity_id ?? ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs font-semibold">{log.actor_name ?? log.actor_email ?? "system"}</div>
                    <div className="font-mono text-xs text-slate-500">{log.actor_id ?? ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <pre className="max-h-28 max-w-xl overflow-auto rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                      {JSON.stringify(log.details ?? {}, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
              {!logs.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No audit logs yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
