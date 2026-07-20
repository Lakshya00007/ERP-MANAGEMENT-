import Link from "next/link";
import { Plus } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { createSchoolAction } from "@/lib/actions";
import { queryRows } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import type { School } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function SchoolsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = getParam(params, "q");
  const status = getParam(params, "status");
  const conditions: string[] = [];
  const values: string[] = [];

  if (q) {
    values.push(`%${q}%`);
    conditions.push(
      `(school_name ilike $${values.length} or city ilike $${values.length} or email ilike $${values.length} or phone ilike $${values.length})`,
    );
  }

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  const schools = await queryRows<School>(
    `select *
     from schools
     ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
     order by created_at desc`,
    values,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Schools</h1>
        <p className="text-sm text-slate-500">Add schools, edit customer details, and open school profiles.</p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5" />
          <h2 className="text-lg font-bold">Add School</h2>
        </div>
        <form action={createSchoolAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input name="school_name" required placeholder="School name" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="contact_person" placeholder="Contact person" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="phone" placeholder="Phone" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="email" type="email" placeholder="Email" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="city" placeholder="City" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <input name="state" placeholder="State" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
          <select name="status" defaultValue="Active" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
            <option>Active</option>
            <option>Inactive</option>
          </select>
          <button type="submit" className="h-10 rounded-md bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">Save School</button>
          <textarea name="address" placeholder="Address" className="min-h-20 rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-slate-500 md:col-span-2" />
          <textarea name="notes" placeholder="Notes" className="min-h-20 rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-slate-500 md:col-span-2" />
        </form>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <form className="grid gap-3 md:grid-cols-[1fr_180px_120px]">
            <input name="q" defaultValue={q} placeholder="Search name, city, email, phone" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" />
            <select name="status" defaultValue={status} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500">
              <option value="">All statuses</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
            <button type="submit" className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 hover:bg-slate-100">Filter</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">School</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Profile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schools.map((school) => (
                <tr key={school.id}>
                  <td className="px-4 py-3 font-semibold">{school.school_name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{school.contact_person ?? "Not set"}</div>
                    <div className="text-xs">{school.phone ?? school.email ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{[school.city, school.state].filter(Boolean).join(", ") || "Not set"}</td>
                  <td className="px-4 py-3"><StatusBadge status={school.status} /></td>
                  <td className="px-4 py-3">{formatDateTime(school.created_at)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/schools/${school.id}`} className="font-bold text-slate-950 underline decoration-slate-300 underline-offset-4">Open</Link>
                  </td>
                </tr>
              ))}
              {!schools.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No schools found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
