"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  CreditCard,
  FileKey2,
  Gauge,
  History,
  MonitorSmartphone,
  ShieldCheck,
} from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/schools", label: "Schools", icon: Building2 },
  { href: "/devices", label: "Devices", icon: MonitorSmartphone },
  { href: "/licenses", label: "Licenses", icon: FileKey2 },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/audit-logs", label: "Audit Logs", icon: History },
];

type AdminShellProps = {
  adminEmail: string;
  children: React.ReactNode;
};

export function AdminShell({ adminEmail, children }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold leading-5">Vidhya Tech</p>
            <p className="text-xs text-slate-500">License Manager</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${
                  active
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-3 rounded-md bg-slate-50 p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-slate-700 shadow-sm">
              <Activity className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{adminEmail}</p>
              <p className="text-xs text-slate-500">Authenticated admin</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 font-bold">
              <ShieldCheck className="h-5 w-5" />
              Vidhya License Manager
            </Link>
            <SignOutButton />
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold ${
                    active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
