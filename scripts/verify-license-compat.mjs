import { createPublicKey, verify as nodeVerify } from "node:crypto";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { signVseLicensePayload } from "../lib/license-core.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const rootDir = path.resolve(__dirname, "..");
const erpGeneratorPath = "/Users/lolodil/Desktop/ERP-Projects/school-erp-desktop/scripts/generate-license.cjs";
const erpPublicKeyPath = "/Users/lolodil/Desktop/ERP-Projects/school-erp-desktop/electron/license-public-key.pem";
const { createLicenseKey: createErpLicenseKey } = require(erpGeneratorPath);

async function loadEnvFile(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
      let value = trimmed.slice(trimmed.indexOf("=") + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  await loadEnvFile(path.join(rootDir, ".env.local"));
  await loadEnvFile(path.join(rootDir, ".env"));

  const rawPrivateKey = process.env.LICENSE_PRIVATE_KEY;

  if (!rawPrivateKey) {
    throw new Error("LICENSE_PRIVATE_KEY is missing");
  }

  const payload = {
    licenseId: "LIC-COMPAT-TEST",
    schoolName: "Wonder Child Public School",
    deviceId: "VSE-6BB7-A428-DF00",
    plan: "Annual",
    issuedAt: "2026-07-18T00:00:00.000Z",
    expiresAt: "2027-07-18T23:59:59.999Z",
    maintenanceUntil: "2027-07-18T23:59:59.999Z",
    maxUsers: 10,
    features: ["attendance", "accounts", "exams", "library"],
  };
  const licenseKey = signVseLicensePayload(payload, rawPrivateKey);
  const erpLicenseKey = createErpLicenseKey(payload, rawPrivateKey);

  assertCondition(licenseKey === erpLicenseKey, "License Manager output does not match ERP generator output byte-for-byte");

  assertCondition(licenseKey.startsWith("VSE1."), "Generated license must start with VSE1");

  const [prefix, payloadPart, signaturePart, extraPart] = licenseKey.split(".");
  assertCondition(prefix === "VSE1" && payloadPart && signaturePart && extraPart === undefined, "License key format is invalid");

  const parsedPayload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  assertCondition(parsedPayload.schoolName === payload.schoolName, "Payload schoolName mismatch");
  assertCondition(parsedPayload.deviceId === payload.deviceId, "Payload deviceId mismatch");

  const publicKey = createPublicKey(await fs.readFile(erpPublicKeyPath, "utf8"));
  const signatureValid = nodeVerify(
    null,
    Buffer.from(payloadPart, "utf8"),
    publicKey,
    Buffer.from(signaturePart, "base64url"),
  );
  assertCondition(signatureValid, "Generated license signature did not verify with ERP public key");

  console.log("License compatibility verification passed.");
  console.log(`Prefix: ${prefix}`);
  console.log(`License ID: ${parsedPayload.licenseId}`);
  console.log(`School: ${parsedPayload.schoolName}`);
  console.log(`Device ID: ${parsedPayload.deviceId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "License compatibility verification failed");
  process.exit(1);
});
