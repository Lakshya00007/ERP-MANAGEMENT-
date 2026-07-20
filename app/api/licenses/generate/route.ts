import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { jsonError, normalizeDateInput, readBodyNumber, readBodyString, requireBodyString } from "@/lib/api";
import { getDb, queryOne } from "@/lib/db";
import { createLicenseId, normalizeLicenseDeviceId, signLicensePayload } from "@/lib/license";
import type { School } from "@/lib/types";

export const runtime = "nodejs";

const allowedPlans = new Set(["Trial", "Monthly", "Annual", "Lifetime"]);

type SchoolForLicense = Pick<School, "id" | "school_name" | "phone" | "email" | "status">;

type ExistingDevice = {
  device_id: string;
  school_id: string | null;
  status: string;
};

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApi();
    const body = (await request.json()) as Record<string, unknown>;
    const schoolId = requireBodyString(body, "schoolId");
    const deviceId = normalizeLicenseDeviceId(requireBodyString(body, "deviceId"));
    const plan = requireBodyString(body, "plan");

    if (!allowedPlans.has(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const maxUsers = readBodyNumber(body, "maxUsers", 10);
    const expiresAtInput = readBodyString(body, "expiresAt");
    const maintenanceUntilInput = readBodyString(body, "maintenanceUntil");

    if (!expiresAtInput) {
      return NextResponse.json({ error: "expiresAt is required" }, { status: 400 });
    }

    if (!maintenanceUntilInput) {
      return NextResponse.json({ error: "maintenanceUntil is required" }, { status: 400 });
    }

    const expiresAt = normalizeDateInput(expiresAtInput);
    const maintenanceUntil = normalizeDateInput(maintenanceUntilInput);

    if (!expiresAt || !maintenanceUntil) {
      return NextResponse.json({ error: "License dates are required" }, { status: 400 });
    }

    const rawFeatures = body.features;
    const features = Array.isArray(rawFeatures)
      ? rawFeatures.map((feature) => (typeof feature === "string" ? feature.trim() : "")).filter(Boolean)
      : rawFeatures && typeof rawFeatures === "object"
        ? Object.entries(rawFeatures)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([feature]) => feature.trim())
            .filter(Boolean)
        : ["all"];
    const normalizedFeatures = features.length ? features : ["all"];
    const school = await queryOne<SchoolForLicense>(
      `select id, school_name, phone, email, status
       from schools
       where id = $1`,
      [schoolId],
    );

    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 });
    }

    const existingDevice = await queryOne<ExistingDevice>(
      `select device_id, school_id, status
       from devices
       where device_id = $1`,
      [deviceId],
    );

    if (existingDevice?.school_id && existingDevice.school_id !== schoolId) {
      return NextResponse.json({ error: "Device ID already belongs to another school" }, { status: 409 });
    }

    const issuedAt = new Date().toISOString();
    const licenseId = createLicenseId();
    const payload = {
      licenseId,
      schoolName: school.school_name,
      deviceId,
      plan,
      issuedAt,
      expiresAt,
      maintenanceUntil,
      maxUsers,
      features: normalizedFeatures,
      ...(school.phone ? { customerPhone: school.phone.trim() } : {}),
      ...(school.email ? { customerEmail: school.email.trim() } : {}),
    };
    const licenseKey = signLicensePayload(payload);
    const db = getDb();

    await db.transaction((tx) => {
      const statements = [];

      if (!existingDevice) {
        statements.push(tx`
          insert into devices (id, school_id, device_id, status)
          values (${randomUUID()}, ${schoolId}, ${deviceId}, ${"Active"})
        `);
      } else if (!existingDevice.school_id) {
        statements.push(tx`
          update devices
          set school_id = ${schoolId}
          where device_id = ${deviceId}
        `);
      }

      statements.push(
        tx`
          insert into licenses (
            id, license_id, school_id, device_id, plan, status, issued_at, expires_at,
            maintenance_until, max_users, features, license_key, created_by
          )
          values (
            ${randomUUID()}, ${licenseId}, ${schoolId}, ${deviceId}, ${plan}, ${"Active"}, ${issuedAt},
            ${expiresAt}, ${maintenanceUntil}, ${maxUsers}, ${JSON.stringify(normalizedFeatures)}::jsonb,
            ${licenseKey}, ${user.id}
          )
        `,
        tx`
          insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
          values (
            ${randomUUID()}, ${user.id}, ${"license.generated"}, ${"license"}, ${licenseId},
            ${JSON.stringify({
              licenseId,
              schoolId,
              schoolName: school.school_name,
              deviceId,
              plan,
              expiresAt,
              maintenanceUntil,
              maxUsers,
              features: normalizedFeatures,
            })}::jsonb
          )
        `,
      );

      return statements;
    });

    return NextResponse.json({ licenseKey, licenseId });
  } catch (error) {
    return jsonError(error, 400);
  }
}
