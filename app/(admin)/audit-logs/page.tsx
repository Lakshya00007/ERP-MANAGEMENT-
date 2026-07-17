import { formatDateTime } from "@/lib/format";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { AuditLog } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage() {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(250);
  const logs = (data ?? []) as AuditLog[];

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
                  <td className="px-4 py-3 font-mono text-xs">{log.actor_id ?? "system"}</td>
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
