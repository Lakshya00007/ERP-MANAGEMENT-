import { createPaymentAction, updatePaymentStatusAction } from "@/lib/actions";
import { StatusBadge } from "@/components/StatusBadge";
import { queryRows } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import type { License, Payment, School } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type PaymentWithSchool = Payment & { schools: { school_name: string } | null };

function getParam(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function PaymentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const status = getParam(params, "status");
  const conditions: string[] = [];
  const values: string[] = [];

  if (status) {
    values.push(status);
    conditions.push(`p.status = $${values.length}`);
  }

  const [payments, schools, licenses] = await Promise.all([
    queryRows<PaymentWithSchool>(
      `select
         p.*,
         case when s.id is null then null else json_build_object('school_name', s.school_name) end as schools
       from payments p
       left join schools s on s.id = p.school_id
       ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
       order by p.created_at desc`,
      values,
    ),
    queryRows<Pick<School, "id" | "school_name">>(
      `select id, school_name
       from schools
       order by school_name`,
    ),
    queryRows<Pick<License, "license_id" | "school_id" | "status">>(
      `select license_id, school_id, status
       from licenses
       order by created_at desc
       limit 500`,
    ),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Payments</h1>
        <p className="text-sm text-slate-500">Track maintenance dues, payment status, and school/license links.</p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">Add Payment Record</h2>
        <form action={createPaymentAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select name="school_id" required className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
            <option value="">Select school</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>{school.school_name}</option>
            ))}
          </select>
          <select name="license_id" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
            <option value="">Link license</option>
            {licenses.map((license) => (
              <option key={license.license_id} value={license.license_id}>{license.license_id} · {license.status}</option>
            ))}
          </select>
          <input name="amount" type="number" min="0" placeholder="Amount" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="payment_mode" placeholder="Mode" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="payment_date" type="date" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="due_date" type="date" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <select name="status" defaultValue="Pending" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
            <option>Pending</option>
            <option>Paid</option>
            <option>Overdue</option>
            <option>Cancelled</option>
          </select>
          <button type="submit" className="h-10 rounded-md bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">Add Payment</button>
          <textarea name="notes" placeholder="Notes" className="min-h-20 rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-slate-500 md:col-span-2 xl:col-span-4" />
        </form>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <form className="grid gap-3 md:grid-cols-[180px_120px]">
            <select name="status" defaultValue={status} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
              <option value="">All statuses</option>
              <option>Pending</option>
              <option>Paid</option>
              <option>Overdue</option>
              <option>Cancelled</option>
            </select>
            <button type="submit" className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 hover:bg-slate-100">Filter</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">School</th>
                <th className="px-4 py-3">License</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-3 font-semibold">{payment.schools?.school_name ?? "Unknown"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{payment.license_id ?? "Unlinked"}</td>
                  <td className="px-4 py-3">{payment.amount ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <div>Paid: {payment.payment_date ?? "Not set"}</div>
                    <div>Due: {payment.due_date ?? "Not set"}</div>
                    <div>Added: {formatDateTime(payment.created_at)}</div>
                  </td>
                  <td className="px-4 py-3">{payment.payment_mode ?? "Not set"}</td>
                  <td className="px-4 py-3"><StatusBadge status={payment.status} /></td>
                  <td className="px-4 py-3">
                    <form action={updatePaymentStatusAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={payment.id} />
                      <button name="status" value="Paid" className="h-8 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-bold text-emerald-800">Paid</button>
                      <button name="status" value="Overdue" className="h-8 rounded-md border border-rose-200 bg-rose-50 px-2 text-xs font-bold text-rose-800">Overdue</button>
                      <button name="status" value="Pending" className="h-8 rounded-md border border-blue-200 bg-blue-50 px-2 text-xs font-bold text-blue-800">Pending</button>
                    </form>
                  </td>
                </tr>
              ))}
              {!payments.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">No payments found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
