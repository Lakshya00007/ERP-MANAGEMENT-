import Link from "next/link";
import { AlertTriangle, Building2, CheckCircle2, Clock3, CreditCard, MonitorCheck } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { AuditLog, License } from "@/lib/types";

export const dynamic = "force-dynamic";

type LicenseWithSchool = License & { schools: { school_name: string } | null };

export default async function DashboardPage() {
  const supabase = createSupabaseAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    schoolsCount,
    activeLicensesCount,
    suspendedLicensesCount,
    expiredLicensesCount,
    pendingPaymentsCount,
    checkinsResult,
    recentLicensesResult,
    recentLogsResult,
  ] = await Promise.all([
    supabase.from("schools").select("id", { count: "exact", head: true }),
    supabase.from("licenses").select("id", { count: "exact", head: true }).eq("status", "Active"),
    supabase.from("licenses").select("id", { count: "exact", head: true }).eq("status", "Suspended"),
    supabase.from("licenses").select("id", { count: "exact", head: true }).or(`status.eq.Expired,expires_at.lt.${new Date().toISOString()}`),
    supabase.from("payments").select("id", { count: "exact", head: true }).in("status", ["Pending", "Overdue"]),
    supabase.from("license_checkins").select("device_id,license_id,status_returned,checked_at").gte("checked_at", today.toISOString()),
    supabase
      .from("licenses")
      .select("license_id,plan,status,expires_at,created_at,schools(school_name)")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(8),
  ]);

  const checkedDevices = new Set((checkinsResult.data ?? []).map((row) => row.device_id).filter(Boolean));
  const recentLicenses = (recentLicensesResult.data ?? []) as unknown as LicenseWithSchool[];
  const recentLogs = (recentLogsResult.data ?? []) as AuditLog[];
  const stats = [
    {
      label: "Total Schools",
      value: schoolsCount.count ?? 0,
      icon: Building2,
      href: "/schools",
      tone: "bg-slate-950 text-white",
    },
    {
      label: "Active Licenses",
      value: activeLicensesCount.count ?? 0,
      icon: CheckCircle2,
      href: "/licenses?status=Active",
      tone: "bg-emerald-600 text-white",
    },
    {
      label: "Suspended Licenses",
      value: suspendedLicensesCount.count ?? 0,
      icon: AlertTriangle,
      href: "/licenses?status=Suspended",
      tone: "bg-amber-500 text-white",
    },
    {
      label: "Expired Licenses",
      value: expiredLicensesCount.count ?? 0,
      icon: Clock3,
      href: "/licenses?status=Expired",
      tone: "bg-zinc-700 text-white",
    },
    {
      label: "Devices Checked In Today",
      value: checkedDevices.size,
      icon: MonitorCheck,
      href: "/devices",
      tone: "bg-blue-600 text-white",
    },
    {
      label: "Pending / Overdue Payments",
      value: pendingPaymentsCount.count ?? 0,
      icon: CreditCard,
      href: "/payments?status=Pending",
      tone: "bg-rose-600 text-white",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Dashboard</h1>
          <p className="text-sm text-slate-500">License, device, and payment health across Vidhya School ERP installs.</p>
        </div>
        <Link
          href="/licenses"
          className="inline-flex h-10 items-center rounded-md bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800"
        >
          Generate License
        </Link>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-500">{stat.label}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-950">{stat.value}</p>
                </div>
                <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${stat.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </Link>
          );
        })}
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-bold">Recent Licenses</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">License</th>
                  <th className="px-4 py-3">School</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLicenses.map((license) => (
                  <tr key={license.license_id}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{license.license_id}</td>
                    <td className="px-4 py-3">{license.schools?.school_name ?? "Unknown"}</td>
                    <td className="px-4 py-3">{license.plan}</td>
                    <td className="px-4 py-3"><StatusBadge status={license.status} /></td>
                    <td className="px-4 py-3">{formatDateTime(license.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-bold">Latest Audit Logs</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {recentLogs.map((log) => (
              <div key={log.id} className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">{log.action}</p>
                <p className="text-xs text-slate-500">{formatDateTime(log.created_at)}</p>
              </div>
            ))}
            {!recentLogs.length ? <p className="px-4 py-6 text-sm text-slate-500">No audit logs yet.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
