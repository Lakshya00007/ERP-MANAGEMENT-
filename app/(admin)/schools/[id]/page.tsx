import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { createDeviceAction, createPaymentAction, updateSchoolAction } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Device, License, Payment, School } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SchoolProfilePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const [schoolResult, devicesResult, licensesResult, paymentsResult] = await Promise.all([
    supabase.from("schools").select("*").eq("id", id).maybeSingle(),
    supabase.from("devices").select("*").eq("school_id", id).order("created_at", { ascending: false }),
    supabase.from("licenses").select("*").eq("school_id", id).order("created_at", { ascending: false }),
    supabase.from("payments").select("*").eq("school_id", id).order("created_at", { ascending: false }),
  ]);

  if (!schoolResult.data) {
    notFound();
  }

  const school = schoolResult.data as School;
  const devices = (devicesResult.data ?? []) as Device[];
  const licenses = (licensesResult.data ?? []) as License[];
  const payments = (paymentsResult.data ?? []) as Payment[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">{school.school_name}</h1>
          <p className="text-sm text-slate-500">{[school.city, school.state].filter(Boolean).join(", ") || "School profile"}</p>
        </div>
        <StatusBadge status={school.status} />
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">Edit School</h2>
        <form action={updateSchoolAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="id" value={school.id} />
          <input name="school_name" required defaultValue={school.school_name} className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="contact_person" defaultValue={school.contact_person ?? ""} placeholder="Contact person" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="phone" defaultValue={school.phone ?? ""} placeholder="Phone" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="email" type="email" defaultValue={school.email ?? ""} placeholder="Email" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="city" defaultValue={school.city ?? ""} placeholder="City" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="state" defaultValue={school.state ?? ""} placeholder="State" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <select name="status" defaultValue={school.status} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
            <option>Active</option>
            <option>Inactive</option>
          </select>
          <button type="submit" className="h-10 rounded-md bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">Update School</button>
          <textarea name="address" defaultValue={school.address ?? ""} placeholder="Address" className="min-h-20 rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-slate-500 md:col-span-2" />
          <textarea name="notes" defaultValue={school.notes ?? ""} placeholder="Notes" className="min-h-20 rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-slate-500 md:col-span-2" />
        </form>
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-bold">Devices</h2>
            <form action={createDeviceAction} className="mt-3 grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="school_id" value={school.id} />
              <input name="device_id" required placeholder="Device ID" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
              <input name="device_name" placeholder="Device name" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
              <input name="os" placeholder="OS" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
              <input name="app_version" placeholder="App version" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
              <button type="submit" className="h-10 rounded-md bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 sm:col-span-2">Register Device</button>
            </form>
          </div>
          <div className="divide-y divide-slate-100">
            {devices.map((device) => (
              <div key={device.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm font-bold">{device.device_id}</p>
                  <StatusBadge status={device.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">Last seen: {formatDateTime(device.last_seen_at)}</p>
              </div>
            ))}
            {!devices.length ? <p className="px-4 py-6 text-sm text-slate-500">No devices registered.</p> : null}
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-bold">Licenses</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {licenses.map((license) => (
              <div key={license.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm font-bold">{license.license_id}</p>
                  <StatusBadge status={license.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{license.plan} · Device {license.device_id} · Expires {formatDateTime(license.expires_at)}</p>
              </div>
            ))}
            {!licenses.length ? <p className="px-4 py-6 text-sm text-slate-500">No licenses generated.</p> : null}
          </div>
        </section>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-bold">Payments</h2>
          <form action={createPaymentAction} className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <input type="hidden" name="school_id" value={school.id} />
            <select name="license_id" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
              <option value="">No license link</option>
              {licenses.map((license) => (
                <option key={license.license_id} value={license.license_id}>{license.license_id}</option>
              ))}
            </select>
            <input name="amount" type="number" min="0" placeholder="Amount" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
            <input name="payment_date" type="date" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
            <input name="due_date" type="date" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
            <select name="status" defaultValue="Pending" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
              <option>Pending</option>
              <option>Paid</option>
              <option>Overdue</option>
              <option>Cancelled</option>
            </select>
            <button type="submit" className="h-10 rounded-md bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">Add Payment</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">License</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-3 font-mono text-xs">{payment.license_id ?? "Unlinked"}</td>
                  <td className="px-4 py-3">{payment.amount ?? 0}</td>
                  <td className="px-4 py-3">{payment.due_date ?? "Not set"}</td>
                  <td className="px-4 py-3"><StatusBadge status={payment.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
