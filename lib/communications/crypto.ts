import "server-only";

import crypto from "node:crypto";
import { getCommunicationEncryptionKey } from "@/lib/env";

const IV_BYTES = 12;
const TAG_BYTES = 16;

function getAesKey() {
  const raw = getCommunicationEncryptionKey();
  const hex = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : null;

  if (hex?.length === 32) {
    return hex;
  }

  const base64 = Buffer.from(raw, "base64");
  if (base64.length === 32) {
    return base64;
  }

  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

export function encryptJson(value: unknown) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", getAesKey(), iv, {
    authTagLength: TAG_BYTES,
  });
  const plaintext = Buffer.from(JSON.stringify(value ?? {}), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptJson<T = Record<string, unknown>>(ciphertext: string | null | undefined): T {
  if (!ciphertext) {
    return {} as T;
  }

  const [version, ivText, tagText, encryptedText] = ciphertext.split(":");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    throw new Error("Encrypted configuration is invalid");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getAesKey(),
    Buffer.from(ivText, "base64url"),
    { authTagLength: TAG_BYTES },
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}

export function generateCommunicationToken() {
  const body = crypto.randomBytes(32).toString("base64url");
  const rawToken = `vse_comm_${body}`;
  return {
    rawToken,
    tokenHash: hashCommunicationToken(rawToken),
    tokenPrefix: `${rawToken.slice(0, 12)}...${rawToken.slice(-6)}`,
  };
}

export function hashCommunicationToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function hashPayload(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value ?? {}), "utf8")
    .digest("hex");
}
