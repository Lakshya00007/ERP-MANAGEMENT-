import { NextResponse } from "next/server";
import { getRequestIp, readBodyString, requireBodyString } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Device, License } from "@/lib/types";

export const runtime = "nodejs";

type CheckResponse = {
  valid: boolean;
  status: string;
  message: string;
  expiresAt: string | null;
  maintenanceUntil: string | null;
  serverTime: string;
  maintenanceExpired?: boolean;
};

async function saveCheckin(input: {
  licenseId: string | null;
  deviceId: string | null;
  schoolId: string | null;
  statusReturned: string;
  appVersion: string | null;
  os: string | null;
  ipAddress: string | null;
  notes?: string;
}) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("license_checkins").insert({
    license_id: input.licenseId,
    device_id: input.deviceId,
    school_id: input.schoolId,
    status_returned: input.statusReturned,
    app_version: input.appVersion,
    os: input.os,
    ip_address: input.ipAddress,
    notes: input.notes ?? null,
  });
}

async function touchDevice(deviceId: string, appVersion: string | null, os: string | null, ipAddress: string | null) {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("devices")
    .update({
      app_version: appVersion,
      os,
      last_seen_at: new Date().toISOString(),
      last_ip: ipAddress,
    })
    .eq("device_id", deviceId);
}

export async function POST(request: Request) {
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const serverTime = now.toISOString();
  const ipAddress = getRequestIp(request);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const licenseId = requireBodyString(body, "licenseId");
    const deviceId = requireBodyString(body, "deviceId");
    const appVersion = readBodyString(body, "appVersion");
    const os = readBodyString(body, "os");
    const { data: license, error } = await supabase
      .from("licenses")
      .select("*")
      .eq("license_id", licenseId)
      .maybeSingle<License>();

    if (error) {
      throw new Error(error.message);
    }

    if (!license) {
      await saveCheckin({
        licenseId,
        deviceId,
        schoolId: null,
        statusReturned: "NotFound",
        appVersion,
        os,
        ipAddress,
        notes: "License not found",
      });
      await touchDevice(deviceId, appVersion, os, ipAddress);

      return NextResponse.json<CheckResponse>({
        valid: false,
        status: "NotFound",
        message: "License not found",
        expiresAt: null,
        maintenanceUntil: null,
        serverTime,
      });
    }

    if (license.device_id !== deviceId) {
      await saveCheckin({
        licenseId,
        deviceId,
        schoolId: license.school_id,
        statusReturned: "DeviceMismatch",
        appVersion,
        os,
        ipAddress,
        notes: `Expected ${license.device_id}`,
      });
      await touchDevice(deviceId, appVersion, os, ipAddress);

      return NextResponse.json<CheckResponse>({
        valid: false,
        status: "DeviceMismatch",
        message: "License is not valid for this device",
        expiresAt: license.expires_at,
        maintenanceUntil: license.maintenance_until,
        serverTime,
      });
    }

    const { data: device } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle<Device>();

    await touchDevice(deviceId, appVersion, os, ipAddress);

    if (device?.status === "Suspended" || device?.status === "Revoked") {
      await saveCheckin({
        licenseId,
        deviceId,
        schoolId: license.school_id,
        statusReturned: `Device${device.status}`,
        appVersion,
        os,
        ipAddress,
      });

      return NextResponse.json<CheckResponse>({
        valid: false,
        status: device.status,
        message: `Device ${device.status.toLowerCase()}`,
        expiresAt: license.expires_at,
        maintenanceUntil: license.maintenance_until,
        serverTime,
      });
    }

    if (license.status === "Suspended" || license.status === "Revoked") {
      await saveCheckin({
        licenseId,
        deviceId,
        schoolId: license.school_id,
        statusReturned: license.status,
        appVersion,
        os,
        ipAddress,
      });

      return NextResponse.json<CheckResponse>({
        valid: false,
        status: license.status,
        message: `License ${license.status.toLowerCase()}`,
        expiresAt: license.expires_at,
        maintenanceUntil: license.maintenance_until,
        serverTime,
      });
    }

    const expired = Boolean(license.expires_at && new Date(license.expires_at).getTime() < now.getTime());

    if (license.status === "Expired" || expired) {
      if (license.status !== "Expired") {
        await supabase.from("licenses").update({ status: "Expired" }).eq("license_id", licenseId);
        await writeAuditLog({
          actorId: null,
          action: "license.expired_on_check",
          entityType: "license",
          entityId: licenseId,
          details: { expiresAt: license.expires_at },
        });
      }

      await saveCheckin({
        licenseId,
        deviceId,
        schoolId: license.school_id,
        statusReturned: "Expired",
        appVersion,
        os,
        ipAddress,
      });

      return NextResponse.json<CheckResponse>({
        valid: false,
        status: "Expired",
        message: "License expired",
        expiresAt: license.expires_at,
        maintenanceUntil: license.maintenance_until,
        serverTime,
      });
    }

    const maintenanceExpired = Boolean(
      license.maintenance_until && new Date(license.maintenance_until).getTime() < now.getTime(),
    );

    await saveCheckin({
      licenseId,
      deviceId,
      schoolId: license.school_id,
      statusReturned: maintenanceExpired ? "ActiveMaintenanceExpired" : "Active",
      appVersion,
      os,
      ipAddress,
    });

    return NextResponse.json<CheckResponse>({
      valid: true,
      status: "Active",
      message: maintenanceExpired ? "License active; maintenance expired" : "License active",
      expiresAt: license.expires_at,
      maintenanceUntil: license.maintenance_until,
      maintenanceExpired,
      serverTime,
    });
  } catch (error) {
    await saveCheckin({
      licenseId: null,
      deviceId: null,
      schoolId: null,
      statusReturned: "BadRequest",
      appVersion: null,
      os: null,
      ipAddress,
      notes: error instanceof Error ? error.message : "Invalid request",
    });

    return NextResponse.json<CheckResponse>(
      {
        valid: false,
        status: "BadRequest",
        message: error instanceof Error ? error.message : "Invalid request",
        expiresAt: null,
        maintenanceUntil: null,
        serverTime,
      },
      { status: 400 },
    );
  }
}
