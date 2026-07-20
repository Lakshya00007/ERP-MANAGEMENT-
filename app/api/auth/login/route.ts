import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import { jsonError, requireBodyString } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = requireBodyString(body, "email");
    const password = requireBodyString(body, "password");
    const admin = await authenticateAdmin(email, password);

    return NextResponse.json({
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.full_name,
        role: admin.role,
      },
    });
  } catch (error) {
    return jsonError(error, 401);
  }
}
