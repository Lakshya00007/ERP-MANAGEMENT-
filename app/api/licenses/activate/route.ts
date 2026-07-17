import { NextResponse } from "next/server";
import { getRequestIp, readBodyString, requireBodyString } from "@/lib/api";
import { decodeLicensePayload } from "@/lib/license";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { License } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const licenseKey = requireBodyString(body, "licenseKey");
  const deviceId = requireBodyString(body, "deviceId");
  const appVersion = readBodyString(body, "appVersion");
  const os = readBodyString(body, "os");
  const payload = decodeLicensePayload(licenseKey);

  if (!payload) {
    return NextResponse.json({ activated: false, valid: false, message: "Invalid license key" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: license, error } = await supabase
    .from("licenses")
    .select("*")
    .eq("license_id", payload.licenseId)
    .maybeSingle<License>();

  if (error) {
    return NextResponse.json({ activated: false, valid: false, message: error.message }, { status: 500 });
  }

  if (!license) {
    return NextResponse.json({ activated: false, valid: false, message: "License not found" }, { status: 404 });
  }

  if (license.device_id !== deviceId) {
    return NextResponse.json({ activated: false, valid: false, message: "Device mismatch" }, { status: 409 });
  }

  await supabase.from("license_checkins").insert({
    license_id: license.license_id,
    device_id: deviceId,
    school_id: license.school_id,
    status_returned: `Activation${license.status}`,
    app_version: appVersion,
    os,
    ip_address: getRequestIp(request),
    notes: "Activation endpoint",
  });

  await supabase
    .from("devices")
    .update({
      app_version: appVersion,
      os,
      last_seen_at: new Date().toISOString(),
      last_ip: getRequestIp(request),
    })
    .eq("device_id", deviceId);

  return NextResponse.json({
    activated: license.status === "Active",
    valid: license.status === "Active",
    licenseId: license.license_id,
    status: license.status,
    expiresAt: license.expires_at,
    maintenanceUntil: license.maintenance_until,
  });
}
