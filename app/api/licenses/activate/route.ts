import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getRequestIp, readBodyString, requireBodyString } from "@/lib/api";
import { getDb, queryOne } from "@/lib/db";
import { decodeLicensePayload } from "@/lib/license";
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

  const license = await queryOne<License>(
    `select *
     from licenses
     where license_id = $1`,
    [payload.licenseId],
  );

  if (!license) {
    return NextResponse.json({ activated: false, valid: false, message: "License not found" }, { status: 404 });
  }

  if (license.device_id !== deviceId) {
    return NextResponse.json({ activated: false, valid: false, message: "Device mismatch" }, { status: 409 });
  }

  const ipAddress = getRequestIp(request);
  const db = getDb();
  await db.transaction((tx) => [
    tx`
      insert into license_checkins (
        id, license_id, device_id, school_id, status_returned, app_version, os, ip_address, notes
      )
      values (
        ${randomUUID()}, ${license.license_id}, ${deviceId}, ${license.school_id},
        ${`Activation${license.status}`}, ${appVersion}, ${os}, ${ipAddress}, ${"Activation endpoint"}
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

  return NextResponse.json({
    activated: license.status === "Active",
    valid: license.status === "Active",
    licenseId: license.license_id,
    status: license.status,
    expiresAt: license.expires_at,
    maintenanceUntil: license.maintenance_until,
  });
}
