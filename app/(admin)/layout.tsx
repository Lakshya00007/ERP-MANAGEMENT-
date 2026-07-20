import { AdminShell } from "@/components/AdminShell";
import { requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, admin } = await requireAdminPage();

  return <AdminShell adminEmail={admin.email ?? user.email}>{children}</AdminShell>;
}
