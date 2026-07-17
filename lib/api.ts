import { NextResponse } from "next/server";
import { ApiAuthError } from "@/lib/auth";

export function jsonError(error: unknown, fallbackStatus = 500) {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const status = error instanceof ApiAuthError ? error.status : fallbackStatus;

  return NextResponse.json({ error: message }, { status });
}

export function readBodyString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readBodyNumber(body: Record<string, unknown>, key: string, fallback: number) {
  const value = body[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function requireBodyString(body: Record<string, unknown>, key: string) {
  const value = readBodyString(body, key);

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

export function normalizeDateInput(value: string | null, endOfDay = true) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date");
  }

  return parsed.toISOString();
}

export function getRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }

  return request.headers.get("x-real-ip");
}
