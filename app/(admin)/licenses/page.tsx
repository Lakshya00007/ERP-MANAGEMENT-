import { CopyButton } from "@/components/CopyButton";
import { LicenseActions } from "@/components/LicenseActions";
import { LicenseGenerator } from "@/components/LicenseGenerator";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { AuditLog, Device, License, School } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type LicenseWithSchool = License & { schools: { school_name: string } | null };

function getParam(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function LicensesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = getParam(params, "q");
  const status = getParam(params, "status");
  const plan = getParam(params, "plan");
  const expiryBefore = getParam(params, "expiryBefore");
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("licenses").select("*,schools(school_name)").order("created_at", { ascending: false });

  if (q) {
    query = query.or(`license_id.ilike.%${q}%,device_id.ilike.%${q}%`);
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (plan) {
    query = query.eq("plan", plan);
  }

  if (expiryBefore) {
    query = query.lte("expires_at", expiryBefore);
  }

  const [licensesResult, schoolsResult, devicesResult, historyResult] = await Promise.all([
    query,
    supabase.from("schools").select("id,school_name").eq("status", "Active").order("school_name"),
    supabase.from("devices").select("device_id").order("created_at", { ascending: false }).limit(500),
    supabase
      .from("audit_logs")
      .select("*")
      .eq("action", "license.generated")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const licenses = (licensesResult.data ?? []) as unknown as LicenseWithSchool[];
  const schools = (schoolsResult.data ?? []) as Pick<School, "id" | "school_name">[];
  const devices = (devicesResult.data ?? []) as Pick<Device, "device_id">[];
  const history = (historyResult.data ?? []) as AuditLog[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Licenses</h1>
        <p className="text-sm text-slate-500">Generate signed license keys, filter history, and control license status.</p>
      </div>
      <LicenseGenerator schools={schools} devices={devices} />
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_150px_150px_170px_120px]">
            <input name="q" defaultValue={q} placeholder="Search license or device ID" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
            <select name="status" defaultValue={status} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
              <option value="">All statuses</option>
              <option>Active</option>
              <option>Suspended</option>
              <option>Expired</option>
              <option>Revoked</option>
            </select>
            <select name="plan" defaultValue={plan} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
              <option value="">All plans</option>
              <option>Trial</option>
              <option>Monthly</option>
              <option>Annual</option>
              <option>Lifetime</option>
            </select>
            <input name="expiryBefore" defaultValue={expiryBefore} type="date" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
            <button type="submit" className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 hover:bg-slate-100">Filter</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">License</th>
                <th className="px-4 py-3">School</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3">Maintenance</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {licenses.map((license) => (
                <tr key={license.id}>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs font-bold">{license.license_id}</div>
                    <div className="mt-1 text-xs text-slate-500">Issued {formatDateTime(license.issued_at)}</div>
                  </td>
                  <td className="px-4 py-3">{license.schools?.school_name ?? "Unknown"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{license.device_id}</td>
                  <td className="px-4 py-3">{license.plan}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={license.status} />
                    {license.suspend_reason ? <p className="mt-2 max-w-48 text-xs text-amber-700">{license.suspend_reason}</p> : null}
                    {license.revoked_reason ? <p className="mt-2 max-w-48 text-xs text-rose-700">{license.revoked_reason}</p> : null}
                  </td>
                  <td className="px-4 py-3">{formatDateTime(license.expires_at)}</td>
                  <td className="px-4 py-3">{formatDateTime(license.maintenance_until)}</td>
                  <td className="px-4 py-3">
                    {license.license_key ? <CopyButton value={license.license_key} label="Copy key" /> : "Not stored"}
                  </td>
                  <td className="px-4 py-3">
                    <LicenseActions
                      licenseId={license.license_id}
                      status={license.status}
                      expiresAt={license.expires_at}
                      maintenanceUntil={license.maintenance_until}
                    />
                  </td>
                </tr>
              ))}
              {!licenses.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">No licenses found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-bold">License Key Generation History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">License</th>
                <th className="px-4 py-3">School</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3">{formatDateTime(log.created_at)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{String(log.details?.licenseId ?? log.entity_id ?? "")}</td>
                  <td className="px-4 py-3">{String(log.details?.schoolName ?? log.details?.schoolId ?? "")}</td>
                  <td className="px-4 py-3">{String(log.details?.plan ?? "")}</td>
                  <td className="px-4 py-3 font-mono text-xs">{log.actor_id ?? "system"}</td>
                </tr>
              ))}
              {!history.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No generation events yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
