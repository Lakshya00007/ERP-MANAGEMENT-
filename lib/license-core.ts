import { createPrivateKey, randomUUID, sign as nodeSign } from "node:crypto";

export const LICENSE_PREFIX = "VSE1";

export type LicensePayload = {
  licenseId: string;
  schoolName: string;
  deviceId: string;
  plan: string;
  issuedAt: string;
  expiresAt: string;
  maintenanceUntil: string;
  maxUsers: number;
  features: string[];
  customerPhone?: string;
  customerEmail?: string;
};

export class LicenseSigningError extends Error {}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function parseLicensePrivateKey(rawPrivateKey: string) {
  const normalizedPrivateKey = rawPrivateKey.replace(/\\n/g, "\n").trim();

  if (!normalizedPrivateKey) {
    throw new LicenseSigningError("LICENSE_PRIVATE_KEY is missing");
  }

  try {
    const privateKey = createPrivateKey(normalizedPrivateKey);
    const keyType = privateKey.asymmetricKeyType;

    if (keyType !== "ed25519") {
      throw new LicenseSigningError(`Expected Ed25519 private key but received ${keyType ?? "unknown"}`);
    }

    return privateKey;
  } catch (error) {
    if (error instanceof LicenseSigningError) {
      throw error;
    }

    throw new LicenseSigningError("LICENSE_PRIVATE_KEY is not a valid PEM private key");
  }
}

export function normalizeLicenseDeviceId(deviceId: string) {
  const normalized = deviceId.trim().toUpperCase();

  if (!/^VSE-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(normalized)) {
    throw new Error("deviceId must use the VSE-XXXX-XXXX-XXXX format");
  }

  return normalized;
}

export function createLicenseId() {
  return `LIC-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export function signVseLicensePayload(payload: LicensePayload, rawPrivateKey: string) {
  const privateKey = parseLicensePrivateKey(rawPrivateKey);
  const payloadPart = base64Url(JSON.stringify(payload));

  try {
    const signature = nodeSign(null, Buffer.from(payloadPart, "utf8"), privateKey);
    return `${LICENSE_PREFIX}.${payloadPart}.${signature.toString("base64url")}`;
  } catch (error) {
    console.error("License signing failed", error);
    throw new LicenseSigningError("License signing failed");
  }
}

export function decodeVseLicensePayload(licenseKey: string): LicensePayload | null {
  const parts = licenseKey.split(".");

  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as LicensePayload;
  } catch {
    return null;
  }
}
