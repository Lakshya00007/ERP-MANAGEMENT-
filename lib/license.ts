import "server-only";

import { createSign, randomBytes } from "node:crypto";
import { getLicensePrivateKey } from "@/lib/env";

export type LicensePayload = {
  licenseId: string;
  schoolId: string;
  deviceId: string;
  plan: string;
  issuedAt: string;
  expiresAt: string | null;
  maintenanceUntil: string | null;
  maxUsers: number;
  features: Record<string, unknown>;
};

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createLicenseId() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = randomBytes(5).toString("hex").toUpperCase();

  return `VID-${stamp}-${suffix}`;
}

export function signLicensePayload(payload: LicensePayload) {
  const header = {
    alg: "RS256",
    typ: "VIDHYA-LICENSE",
    kid: "v1",
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();

  const signature = signer.sign(getLicensePrivateKey());

  return `v1.${signingInput}.${base64Url(signature)}`;
}

export function decodeLicensePayload(licenseKey: string): LicensePayload | null {
  const parts = licenseKey.split(".");

  if (parts.length !== 4 || parts[0] !== "v1") {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[2], "base64url").toString("utf8")) as LicensePayload;
  } catch {
    return null;
  }
}
