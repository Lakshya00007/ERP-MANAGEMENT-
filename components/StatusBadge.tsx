type StatusBadgeProps = {
  status: string | null | undefined;
};

const statusClasses: Record<string, string> = {
  Active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Inactive: "border-slate-200 bg-slate-50 text-slate-600",
  Suspended: "border-amber-200 bg-amber-50 text-amber-700",
  Revoked: "border-rose-200 bg-rose-50 text-rose-700",
  Expired: "border-zinc-200 bg-zinc-100 text-zinc-700",
  Pending: "border-blue-200 bg-blue-50 text-blue-700",
  Paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Overdue: "border-rose-200 bg-rose-50 text-rose-700",
  Cancelled: "border-slate-200 bg-slate-50 text-slate-600",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = status ?? "Unknown";
  const classes = statusClasses[label] ?? "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}
