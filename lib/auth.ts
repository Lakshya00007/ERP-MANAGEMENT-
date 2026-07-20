import "server-only";

import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthSecret } from "@/lib/env";
import { queryOne, sql } from "@/lib/db";

export type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: "Active" | "Inactive";
  last_login_at: string | null;
};

type AdminUserWithPassword = AdminUser & {
  password_hash: string;
};

export type CurrentAdminUser = {
  id: string;
  email: string;
  role: string;
};

export type CurrentAdmin = {
  user: CurrentAdminUser;
  admin: AdminUser;
};

const SESSION_COOKIE = "vidhya_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getSessionKey() {
  return new TextEncoder().encode(getAuthSecret());
}

function cookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSessionKey(), {
      algorithms: ["HS256"],
    });
    const adminId = payload.sub;

    if (!adminId || typeof payload.email !== "string" || typeof payload.role !== "string") {
      return null;
    }

    const admin = await queryOne<AdminUser>(
      `select id, email, full_name, role, status, last_login_at
       from admin_users
       where id = $1 and status = 'Active'`,
      [adminId],
    );

    if (!admin || admin.email !== payload.email || admin.role !== payload.role) {
      return null;
    }

    return {
      user: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      },
      admin,
    };
  } catch {
    return null;
  }
}

export async function createAdminSession(admin: Pick<AdminUser, "id" | "email" | "role">) {
  const token = await new SignJWT({
    email: admin.email,
    role: admin.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, cookieOptions());
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", cookieOptions(0));
}

export async function authenticateAdmin(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const admin = await queryOne<AdminUserWithPassword>(
    `select id, email, password_hash, full_name, role, status, last_login_at
     from admin_users
     where email = $1`,
    [normalizedEmail],
  );

  if (!admin) {
    throw new Error("Invalid email or password");
  }

  const passwordValid = await bcrypt.compare(password, admin.password_hash);

  if (!passwordValid) {
    throw new Error("Invalid email or password");
  }

  if (admin.status !== "Active") {
    throw new Error("Admin account is inactive");
  }

  await sql`
    update admin_users
    set last_login_at = now()
    where id = ${admin.id}
  `;
  await createAdminSession(admin);

  const { password_hash: _passwordHash, ...safeAdmin } = admin;
  void _passwordHash;

  return safeAdmin;
}

export async function requireAdmin() {
  const currentAdmin = await getCurrentAdmin();

  if (!currentAdmin) {
    redirect("/login");
  }

  return currentAdmin;
}

export async function requireAdminPage() {
  return requireAdmin();
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
