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
