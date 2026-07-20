import "server-only";

import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { hashCommunicationToken } from "@/lib/communications/crypto";
import type { DeviceAuthContext } from "@/lib/communications/types";

type TokenRecord = {
  token_id: string;
  school_id: string;
  school_name: string;
  school_status: string;
  device_id: string;
  device_status: string | null;
  license_id: string | null;
  license_status: string | null;
  license_expires_at: string | null;
  token_status: string;
  token_expires_at: string | null;
};

const requestBuckets = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 120;

function requireBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new Error("Communication device token is required");
  }
  return match[1].trim();
}

function enforceRateLimit(key: string) {
  const now = Date.now();
  const bucket = requestBuckets.get(key)?.filter((timestamp) => now - timestamp < RATE_WINDOW_MS) ?? [];
  bucket.push(now);
  requestBuckets.set(key, bucket);

  if (bucket.length > RATE_LIMIT) {
    const response = NextResponse.json({ error: "Communication rate limit exceeded" }, { status: 429 });
    throw response;
  }
}

export async function authenticateCommunicationDevice(request: Request): Promise<DeviceAuthContext> {
  const rawToken = requireBearerToken(request);
  const tokenHash = hashCommunicationToken(rawToken);
  const record = await queryOne<TokenRecord>(
    `select
       t.id as token_id,
       t.school_id,
       s.school_name,
       s.status as school_status,
       t.device_id,
       d.status as device_status,
       t.license_id,
       l.status as license_status,
       l.expires_at as license_expires_at,
       t.status as token_status,
       t.expires_at as token_expires_at
     from communication_device_tokens t
     join schools s on s.id = t.school_id
     left join devices d on d.school_id = t.school_id and d.device_id = t.device_id
     left join licenses l on l.school_id = t.school_id and l.license_id = t.license_id and l.device_id = t.device_id
     where t.token_hash = $1`,
    [tokenHash],
  );

  if (!record) {
    throw new Error("Invalid communication device token");
  }
  if (record.token_status !== "Active") {
    throw new Error("Communication device token is not active");
  }
  if (record.token_expires_at && new Date(record.token_expires_at).getTime() <= Date.now()) {
    await sql`
      update communication_device_tokens
      set status = ${"Expired"}
      where id = ${record.token_id}
    `;
    throw new Error("Communication device token has expired");
  }
  if (record.school_status !== "Active") {
    throw new Error("School account is inactive");
  }
  if (record.device_status !== "Active") {
    throw new Error("Registered device is not active");
  }
  if (record.license_status !== "Active") {
    throw new Error("ERP license is not active");
  }
  if (record.license_expires_at && new Date(record.license_expires_at).getTime() <= Date.now()) {
    throw new Error("ERP license has expired");
  }

  enforceRateLimit(record.token_id);
  await sql`
    update communication_device_tokens
    set last_used_at = now()
    where id = ${record.token_id}
  `;

  return {
    tokenId: record.token_id,
    schoolId: record.school_id,
    schoolName: record.school_name,
    deviceId: record.device_id,
    licenseId: record.license_id ?? "",
  };
}

export async function withDeviceAuth<T>(request: Request, handler: (context: DeviceAuthContext) => Promise<T>) {
  try {
    return NextResponse.json(await handler(await authenticateCommunicationDevice(request)));
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Communication gateway request failed" },
      { status: /required|invalid|not active|expired|inactive|license/i.test(String(error)) ? 401 : 400 },
    );
  }
}
