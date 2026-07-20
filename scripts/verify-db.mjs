import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
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

function checkLicense(row) {
  if (row.status === "Suspended" || row.status === "Revoked") {
    return { valid: false, status: row.status };
  }

  if (row.status === "Expired" || (row.expires_at && new Date(row.expires_at).getTime() < Date.now())) {
    return { valid: false, status: "Expired" };
  }

  return { valid: true, status: "Active" };
}

async function main() {
  await loadEnvFile(path.join(rootDir, ".env.local"));
  await loadEnvFile(path.join(rootDir, ".env"));

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL. Add it to .env.local or export it before running verification.");
  }

  const prefix = `codex_verify_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const ids = {
    admin: randomUUID(),
    school: randomUUID(),
    device: randomUUID(),
    audit: randomUUID(),
    checkin: randomUUID(),
  };
  const password = `${prefix}_password`;
  const passwordHash = await bcrypt.hash(password, 12);
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("select 1");

    await client.query(
      `insert into admin_users (id, email, password_hash, full_name, role, status)
       values ($1, $2, $3, $4, $5, $6)`,
      [ids.admin, `${prefix}@example.test`, passwordHash, "Verification Admin", "Owner", "Active"],
    );
    assert.equal(await bcrypt.compare(password, passwordHash), true, "admin password hash should verify");

    const schoolResult = await client.query(
      `insert into schools (id, school_name, contact_person, status)
       values ($1, $2, $3, $4)
       returning id`,
      [ids.school, `${prefix} School`, "Verifier", "Active"],
    );
    assert.equal(schoolResult.rows[0].id, ids.school, "school creation should return the test school");

    const deviceId = `${prefix}_device`;
    const deviceResult = await client.query(
      `insert into devices (id, school_id, device_id, device_name, status)
       values ($1, $2, $3, $4, $5)
       returning device_id`,
      [ids.device, ids.school, deviceId, "Verification Device", "Active"],
    );
    assert.equal(deviceResult.rows[0].device_id, deviceId, "device creation should return the test device");

    const licenseRows = [
      { id: randomUUID(), licenseId: `${prefix}_active`, status: "Active", expiresAt: "2999-01-01T00:00:00.000Z" },
      { id: randomUUID(), licenseId: `${prefix}_suspended`, status: "Suspended", expiresAt: "2999-01-01T00:00:00.000Z" },
      { id: randomUUID(), licenseId: `${prefix}_revoked`, status: "Revoked", expiresAt: "2999-01-01T00:00:00.000Z" },
      { id: randomUUID(), licenseId: `${prefix}_expired`, status: "Active", expiresAt: "2000-01-01T00:00:00.000Z" },
    ];

    for (const license of licenseRows) {
      await client.query(
        `insert into licenses (
           id, license_id, school_id, device_id, plan, status, issued_at, expires_at,
           maintenance_until, max_users, features, license_key, created_by
         )
         values ($1, $2, $3, $4, $5, $6, now(), $7, $8, $9, $10::jsonb, $11, $12)`,
        [
          license.id,
          license.licenseId,
          ids.school,
          deviceId,
          "Annual",
          license.status,
          license.expiresAt,
          "2999-01-01T00:00:00.000Z",
          10,
          JSON.stringify({ attendance: true }),
          `${license.licenseId}_key`,
          ids.admin,
        ],
      );
    }

    const lookup = await client.query("select * from licenses where license_id = $1", [licenseRows[0].licenseId]);
    assert.equal(lookup.rowCount, 1, "license lookup should find the persisted license");
    assert.deepEqual(checkLicense(lookup.rows[0]), { valid: true, status: "Active" });

    for (const expected of [
      [licenseRows[1].licenseId, { valid: false, status: "Suspended" }],
      [licenseRows[2].licenseId, { valid: false, status: "Revoked" }],
      [licenseRows[3].licenseId, { valid: false, status: "Expired" }],
    ]) {
      const result = await client.query("select * from licenses where license_id = $1", [expected[0]]);
      assert.deepEqual(checkLicense(result.rows[0]), expected[1]);
    }

    await client.query(
      `insert into license_checkins (
         id, license_id, device_id, school_id, status_returned, app_version, os, ip_address, notes
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [ids.checkin, licenseRows[0].licenseId, deviceId, ids.school, "Active", "verify", "test", "127.0.0.1", prefix],
    );
    const checkin = await client.query("select id from license_checkins where id = $1", [ids.checkin]);
    assert.equal(checkin.rowCount, 1, "check-in insertion should persist within the transaction");

    await client.query(
      `insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [ids.audit, ids.admin, "verification.audit", "license", licenseRows[0].licenseId, JSON.stringify({ prefix })],
    );
    const audit = await client.query("select id from audit_logs where id = $1", [ids.audit]);
    assert.equal(audit.rowCount, 1, "audit-log insertion should persist within the transaction");

    await client.query("rollback");
    console.log("Database verification passed. Test records were rolled back.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
