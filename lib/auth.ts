import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  status: "Active" | "Inactive";
};

export type CurrentAdmin = {
  user: User;
  admin: AdminUser;
};

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const adminClient = createSupabaseAdminClient();
  const { data: admin, error: adminError } = await adminClient
    .from("admin_users")
    .select("user_id,email,full_name,role,status")
    .eq("user_id", user.id)
    .eq("status", "Active")
    .maybeSingle<AdminUser>();

  if (adminError || !admin) {
    return null;
  }

  return { user, admin };
}

export async function requireAdminPage() {
  const currentAdmin = await getCurrentAdmin();

  if (!currentAdmin) {
    redirect("/login");
  }

  return currentAdmin;
}

export class ApiAuthError extends Error {
  status = 401;
}

export async function requireAdminApi() {
  const currentAdmin = await getCurrentAdmin();

  if (!currentAdmin) {
    throw new ApiAuthError("Admin authentication required");
  }

  return currentAdmin;
}
