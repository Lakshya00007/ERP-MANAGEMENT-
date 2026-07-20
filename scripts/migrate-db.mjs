import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ws from "ws";
import { Pool, neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

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

async function loadLocalEnv() {
  await loadEnvFile(path.join(rootDir, ".env.local"));
  await loadEnvFile(path.join(rootDir, ".env"));
}

async function main() {
  await loadLocalEnv();

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL. Add it to .env.local or export it before running migrations.");
  }

  const migrationsDir = path.join(rootDir, "db", "migrations");
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (!files.length) {
    console.log("No migrations found.");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedResult = await client.query("select name from schema_migrations");
    const applied = new Set(appliedResult.rows.map((row) => row.name));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Skipping ${file}; already applied.`);
        continue;
      }

      const migrationSql = await fs.readFile(path.join(migrationsDir, file), "utf8");

      try {
        await client.query("begin");
        await client.query(migrationSql);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log(`Applied ${file}.`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${error.message}`);
      }
    }

    console.log("Database migrations complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
