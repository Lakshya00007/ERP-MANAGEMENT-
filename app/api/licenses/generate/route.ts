import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { jsonError, normalizeDateInput, readBodyNumber, requireBodyString } from "@/lib/api";
import { createLicenseId, signLicensePayload } from "@/lib/license";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { School } from "@/lib/types";

export const runtime = "nodejs";

const allowedPlans = new Set(["Trial", "Monthly", "Annual", "Lifetime"]);

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApi();
    const body = (await request.json()) as Record<string, unknown>;
    const schoolId = requireBodyString(body, "schoolId");
    const deviceId = requireBodyString(body, "deviceId");
    const plan = requireBodyString(body, "plan");

    if (!allowedPlans.has(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const maxUsers = readBodyNumber(body, "maxUsers", 10);
    const expiresAt = normalizeDateInput(typeof body.expiresAt === "string" ? body.expiresAt : null);
    const maintenanceUntil = normalizeDateInput(
      typeof body.maintenanceUntil === "string" ? body.maintenanceUntil : null,
    );
    const features =
      body.features && typeof body.features === "object" && !Array.isArray(body.features)
        ? (body.features as Record<string, unknown>)
        : {};
    const supabase = createSupabaseAdminClient();
    const { data: school, error: schoolError } = await supabase
      .from("schools")
      .select("id,school_name,status")
      .eq("id", schoolId)
      .maybeSingle<Pick<School, "id" | "school_name" | "status">>();

    if (schoolError) {
      throw new Error(schoolError.message);
    }

    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 });
    }

    const { data: existingDevice, error: deviceLookupError } = await supabase
      .from("devices")
      .select("device_id,school_id,status")
      .eq("device_id", deviceId)
      .maybeSingle<{ device_id: string; school_id: string | null; status: string }>();

    if (deviceLookupError) {
      throw new Error(deviceLookupError.message);
    }

    if (existingDevice && existingDevice.school_id && existingDevice.school_id !== schoolId) {
      return NextResponse.json({ error: "Device ID already belongs to another school" }, { status: 409 });
    }

    if (!existingDevice) {
      const { error: insertDeviceError } = await supabase.from("devices").insert({
        school_id: schoolId,
        device_id: deviceId,
        status: "Active",
      });

      if (insertDeviceError) {
        throw new Error(insertDeviceError.message);
      }
    } else if (!existingDevice.school_id) {
      const { error: updateDeviceError } = await supabase
        .from("devices")
        .update({ school_id: schoolId })
        .eq("device_id", deviceId);

      if (updateDeviceError) {
        throw new Error(updateDeviceError.message);
      }
    }

    const issuedAt = new Date().toISOString();
    const licenseId = createLicenseId();
    const payload = {
      licenseId,
      schoolId,
      deviceId,
      plan,
      issuedAt,
      expiresAt,
      maintenanceUntil,
      maxUsers,
      features,
    };
    const licenseKey = signLicensePayload(payload);
    const { error: insertLicenseError } = await supabase.from("licenses").insert({
      license_id: licenseId,
      school_id: schoolId,
      device_id: deviceId,
      plan,
      status: "Active",
      issued_at: issuedAt,
      expires_at: expiresAt,
      maintenance_until: maintenanceUntil,
      max_users: maxUsers,
      features,
      license_key: licenseKey,
      created_by: user.id,
    });

    if (insertLicenseError) {
      throw new Error(insertLicenseError.message);
    }

    await writeAuditLog({
      actorId: user.id,
      action: "license.generated",
      entityType: "license",
      entityId: licenseId,
      details: {
        licenseId,
        schoolId,
        schoolName: school.school_name,
        deviceId,
        plan,
        expiresAt,
        maintenanceUntil,
        maxUsers,
        features,
      },
    });

    return NextResponse.json({ licenseKey, licenseId });
  } catch (error) {
    return jsonError(error, 400);
  }
}
