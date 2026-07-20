import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getRequestIp, readBodyString, requireBodyString } from "@/lib/api";
import { getDb, queryOne } from "@/lib/db";
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

type CheckinInput = {
  licenseId: string | null;
  deviceId: string | null;
  schoolId: string | null;
  statusReturned: string;
  appVersion: string | null;
  os: string | null;
  ipAddress: string | null;
  notes?: string;
};

async function recordCheckinAndTouch(input: CheckinInput) {
  const db = getDb();

  if (!input.deviceId) {
    await db.transaction((tx) => [
      tx`
        insert into license_checkins (
          id, license_id, device_id, school_id, status_returned, app_version, os, ip_address, notes
        )
        values (
          ${randomUUID()}, ${input.licenseId}, ${input.deviceId}, ${input.schoolId},
          ${input.statusReturned}, ${input.appVersion}, ${input.os}, ${input.ipAddress},
          ${input.notes ?? null}
        )
      `,
    ]);
    return;
  }

  await db.transaction((tx) => [
    tx`
      insert into license_checkins (
        id, license_id, device_id, school_id, status_returned, app_version, os, ip_address, notes
      )
      values (
        ${randomUUID()}, ${input.licenseId}, ${input.deviceId}, ${input.schoolId},
        ${input.statusReturned}, ${input.appVersion}, ${input.os}, ${input.ipAddress},
        ${input.notes ?? null}
      )
    `,
    tx`
      update devices
      set app_version = ${input.appVersion},
          os = ${input.os},
          last_seen_at = now(),
          last_ip = ${input.ipAddress}
      where device_id = ${input.deviceId}
    `,
  ]);
}

async function recordExpiredCheck(
  license: License,
  deviceId: string,
  appVersion: string | null,
  os: string | null,
  ipAddress: string | null,
) {
  const db = getDb();

  if (license.status === "Expired") {
    await recordCheckinAndTouch({
      licenseId: license.license_id,
      deviceId,
      schoolId: license.school_id,
      statusReturned: "Expired",
      appVersion,
      os,
      ipAddress,
    });
    return;
  }

  await db.transaction((tx) => [
    tx`
      update licenses
      set status = ${"Expired"}
      where license_id = ${license.license_id}
    `,
    tx`
      insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
      values (
        ${randomUUID()}, ${null}, ${"license.expired_on_check"}, ${"license"}, ${license.license_id},
        ${JSON.stringify({ expiresAt: license.expires_at })}::jsonb
      )
    `,
    tx`
      insert into license_checkins (
        id, license_id, device_id, school_id, status_returned, app_version, os, ip_address
      )
      values (
        ${randomUUID()}, ${license.license_id}, ${deviceId}, ${license.school_id},
        ${"Expired"}, ${appVersion}, ${os}, ${ipAddress}
      )
    `,
    tx`
      update devices
      set app_version = ${appVersion},
          os = ${os},
          last_seen_at = now(),
          last_ip = ${ipAddress}
      where device_id = ${deviceId}
    `,
  ]);
}

export async function POST(request: Request) {
  const now = new Date();
  const serverTime = now.toISOString();
  const ipAddress = getRequestIp(request);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const licenseId = requireBodyString(body, "licenseId");
    const deviceId = requireBodyString(body, "deviceId");
    const appVersion = readBodyString(body, "appVersion");
    const os = readBodyString(body, "os");
    const license = await queryOne<License>(
      `select *
       from licenses
       where license_id = $1`,
      [licenseId],
    );

    if (!license) {
      await recordCheckinAndTouch({
        licenseId,
        deviceId,
        schoolId: null,
        statusReturned: "NotFound",
        appVersion,
        os,
        ipAddress,
        notes: "License not found",
      });

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
      await recordCheckinAndTouch({
        licenseId,
        deviceId,
        schoolId: license.school_id,
        statusReturned: "DeviceMismatch",
        appVersion,
        os,
        ipAddress,
        notes: `Expected ${license.device_id}`,
      });

      return NextResponse.json<CheckResponse>({
        valid: false,
        status: "DeviceMismatch",
        message: "License is not valid for this device",
        expiresAt: license.expires_at,
        maintenanceUntil: license.maintenance_until,
        serverTime,
      });
    }

    const device = await queryOne<Device>(
      `select *
       from devices
       where device_id = $1`,
      [deviceId],
    );

    if (device?.status === "Suspended" || device?.status === "Revoked") {
      await recordCheckinAndTouch({
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
      await recordCheckinAndTouch({
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
      await recordExpiredCheck(license, deviceId, appVersion, os, ipAddress);

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

    await recordCheckinAndTouch({
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
    await recordCheckinAndTouch({
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
