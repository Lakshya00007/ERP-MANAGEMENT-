export function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getDatabaseUrl() {
  return getRequiredEnv("DATABASE_URL");
}

export function getAuthSecret() {
  const secret = getRequiredEnv("AUTH_SECRET");

  if (secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters long");
  }

  return secret;
}

export function getLicensePrivateKey() {
  const value = process.env.LICENSE_PRIVATE_KEY;

  if (!value) {
    throw new Error("LICENSE_PRIVATE_KEY is missing");
  }

  return value.replace(/\\n/g, "\n").trim();
}

export function getCommunicationEncryptionKey() {
  const value = getRequiredEnv("COMMUNICATION_ENCRYPTION_KEY").trim();

  if (value.length < 32) {
    throw new Error("COMMUNICATION_ENCRYPTION_KEY must contain at least 32 characters of entropy");
  }

  return value;
}

export function getCommunicationProviderMode() {
  return process.env.COMMUNICATION_PROVIDER_MODE === "live" ? "live" : "mock";
}

export function getMetaGraphApiVersion() {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v23.0";
}

export function getMetaAppSecret() {
  return process.env.META_APP_SECRET?.trim() || "";
}

export function getMetaWebhookVerifyToken() {
  return process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || "";
}

export function getCommunicationCronSecret() {
  return process.env.COMMUNICATION_CRON_SECRET?.trim() || "";
}

export function getCommunicationGatewayBaseUrl() {
  return process.env.COMMUNICATION_GATEWAY_BASE_URL?.trim() || "";
}
