import { updateDeviceStatusAction, createDeviceAction } from "@/lib/actions";
import { StatusBadge } from "@/components/StatusBadge";
import { queryRows } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import type { Device, School } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

type DeviceWithSchool = Device & { schools: { school_name: string } | null };

export default async function DevicesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = getParam(params, "q");
  const status = getParam(params, "status");
  const conditions: string[] = [];
  const values: string[] = [];

  if (q) {
    values.push(`%${q}%`);
    conditions.push(
      `(d.device_id ilike $${values.length} or d.device_name ilike $${values.length} or d.os ilike $${values.length})`,
    );
  }

  if (status) {
    values.push(status);
    conditions.push(`d.status = $${values.length}`);
  }

  const [devices, schools] = await Promise.all([
    queryRows<DeviceWithSchool>(
      `select
         d.*,
         case when s.id is null then null else json_build_object('school_name', s.school_name) end as schools
       from devices d
       left join schools s on s.id = d.school_id
       ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
       order by d.created_at desc`,
      values,
    ),
    queryRows<Pick<School, "id" | "school_name">>(
      `select id, school_name
       from schools
       where status = 'Active'
       order by school_name`,
    ),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Devices</h1>
        <p className="text-sm text-slate-500">Register ERP device IDs, inspect last check-in, and block device access.</p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">Register Device</h2>
        <form action={createDeviceAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select name="school_id" required className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500 xl:col-span-2">
            <option value="">Select school</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>{school.school_name}</option>
            ))}
          </select>
          <input name="device_id" required placeholder="Device ID" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="device_name" placeholder="Device name" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="os" placeholder="OS" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <button type="submit" className="h-10 rounded-md bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">Register</button>
        </form>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <form className="grid gap-3 md:grid-cols-[1fr_180px_120px]">
            <input name="q" defaultValue={q} placeholder="Search Device ID, name, OS" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
            <select name="status" defaultValue={status} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
              <option value="">All statuses</option>
              <option>Active</option>
              <option>Suspended</option>
              <option>Revoked</option>
            </select>
            <button type="submit" className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 hover:bg-slate-100">Filter</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Device ID</th>
                <th className="px-4 py-3">School</th>
                <th className="px-4 py-3">OS / Version</th>
                <th className="px-4 py-3">Last Seen</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices.map((device) => (
                <tr key={device.id}>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs font-bold">{device.device_id}</div>
                    <div className="text-xs text-slate-500">{device.device_name ?? ""}</div>
                  </td>
                  <td className="px-4 py-3">{device.schools?.school_name ?? "Unknown"}</td>
                  <td className="px-4 py-3">{[device.os, device.app_version].filter(Boolean).join(" / ") || "Not set"}</td>
                  <td className="px-4 py-3">{formatDateTime(device.last_seen_at)}</td>
                  <td className="px-4 py-3">{device.last_ip ?? "Not captured"}</td>
                  <td className="px-4 py-3"><StatusBadge status={device.status} /></td>
                  <td className="px-4 py-3">
                    <form action={updateDeviceStatusAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="device_id" value={device.device_id} />
                      <button name="status" value="Active" className="h-8 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-bold text-emerald-800">Active</button>
                      <button name="status" value="Suspended" className="h-8 rounded-md border border-amber-200 bg-amber-50 px-2 text-xs font-bold text-amber-800">Suspend</button>
                      <button name="status" value="Revoked" className="h-8 rounded-md border border-rose-200 bg-rose-50 px-2 text-xs font-bold text-rose-800">Revoke</button>
                    </form>
                  </td>
                </tr>
              ))}
              {!devices.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">No devices found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
