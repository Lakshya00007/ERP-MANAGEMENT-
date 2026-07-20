import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
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

function getCommunicationVerificationKey() {
  const raw =
    process.env.COMMUNICATION_ENCRYPTION_KEY ||
    "codex-communication-verification-key-32";
  return createHash("sha256").update(raw, "utf8").digest();
}

function encryptJson(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getCommunicationVerificationKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptJson(ciphertext) {
  const [version, ivText, tagText, encryptedText] = ciphertext.split(":");
  assert.equal(version, "v1", "encrypted payload version should be v1");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getCommunicationVerificationKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  );
}

function hashToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function normalizeIndianPhone(value) {
  let digits = String(value ?? "").trim().replace(/[^\d+]/g, "");
  if (digits.startsWith("+91")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new Error("invalid Indian mobile");
  }
  return `+91${digits}`;
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

    const communicationTokenRaw = `${prefix}_communication_token_${randomUUID()}`;
    const communicationTokenHash = hashToken(communicationTokenRaw);
    const communicationTokenId = randomUUID();
    await client.query(
      `insert into communication_device_tokens (
         id, school_id, license_id, device_id, token_hash, token_prefix,
         status, expires_at, created_by_admin_id
       )
       values ($1, $2, $3, $4, $5, $6, 'Active', $7, $8)`,
      [
        communicationTokenId,
        ids.school,
        licenseRows[0].licenseId,
        deviceId,
        communicationTokenHash,
        "vse_comm...smoke",
        "2999-01-01T00:00:00.000Z",
        ids.admin,
      ],
    );
    const storedToken = await client.query(
      `select token_hash, token_prefix
       from communication_device_tokens
       where id = $1`,
      [communicationTokenId],
    );
    assert.equal(storedToken.rows[0].token_hash, communicationTokenHash, "communication token hash should persist");
    assert.notEqual(storedToken.rows[0].token_hash, communicationTokenRaw, "raw communication token must not be stored");

    const encryptedConfig = encryptJson({
      phoneNumberId: `${prefix}_phone_number_id`,
      accessToken: `${prefix}_meta_access_token_secret`,
    });
    await client.query(
      `insert into communication_integrations (
         id, school_id, channel, provider, status, encrypted_config, display_config
       )
       values ($1, $2, 'WhatsApp', 'MetaCloud', 'Active', $3, $4::jsonb)`,
      [
        randomUUID(),
        ids.school,
        encryptedConfig,
        JSON.stringify({ phoneNumberId: `${prefix}_phone_number_id`, hasAccessToken: true }),
      ],
    );
    const integration = await client.query(
      `select encrypted_config, display_config
       from communication_integrations
       where school_id = $1 and channel = 'WhatsApp'`,
      [ids.school],
    );
    assert.equal(
      decryptJson(integration.rows[0].encrypted_config).accessToken,
      `${prefix}_meta_access_token_secret`,
      "provider config should decrypt server-side",
    );
    assert.equal(
      JSON.stringify(integration.rows[0].display_config).includes("access_token_secret"),
      false,
      "display config must not expose provider secrets",
    );

    const whatsappTemplateId = randomUUID();
    const smsTemplateId = randomUUID();
    await client.query(
      `insert into communication_templates (
         id, school_id, channel, provider, internal_name, category,
         provider_template_name, provider_language_code, body_preview,
         variable_definitions, status
       )
       values ($1, $2, 'WhatsApp', 'MetaCloud', $3, 'Fee Due', $4, 'en_US', $5, $6::jsonb, 'Approved')`,
      [
        whatsappTemplateId,
        ids.school,
        `${prefix}_fee_due_whatsapp`,
        `${prefix}_fee_due_template`,
        "Dear {{student_name}}, fees are due.",
        JSON.stringify([{ name: "student_name" }]),
      ],
    );
    await client.query(
      `insert into communication_templates (
         id, school_id, channel, provider, internal_name, category,
         msg91_flow_id, dlt_template_id, sender_id, body_preview,
         variable_definitions, status
       )
       values ($1, $2, 'SMS', 'MSG91', $3, 'Fee Receipt', $4, $5, $6, $7, $8::jsonb, 'Approved')`,
      [
        smsTemplateId,
        ids.school,
        `${prefix}_fee_receipt_sms`,
        `${prefix}_flow`,
        `${prefix}_dlt`,
        "VDHYAS",
        "Receipt {{receipt_no}} generated.",
        JSON.stringify([{ name: "receipt_no" }]),
      ],
    );
    const approvedTemplates = await client.query(
      `select count(*)::int as count
       from communication_templates
       where school_id = $1 and status = 'Approved'`,
      [ids.school],
    );
    assert.equal(approvedTemplates.rows[0].count, 2, "approved communication templates should persist");
    assert.equal(normalizeIndianPhone("98765 43210"), "+919876543210", "Indian phone normalization should accept common formats");
    assert.throws(() => normalizeIndianPhone("12345"), /invalid Indian mobile/, "invalid phones should be rejected");

    const jobId = randomUUID();
    const idempotencyKey = `${prefix}_idempotency`;
    const encryptedPhone = encryptJson({ phone: "+919876543210" });
    await client.query(
      `insert into communication_jobs (
         id, school_id, device_id, channel, provider, template_id,
         idempotency_key, recipient_type, recipient_entity_id,
         recipient_name, recipient_phone_masked, encrypted_recipient_phone,
         variables, requested_by_user_id, requested_by_name, requested_by_role,
         status, provider_message_id, provider_response_code, submitted_at,
         delivered_at
       )
       values (
         $1, $2, $3, 'WhatsApp', 'MetaCloud', $4, $5, 'Student', $6,
         'Verification Student', '+91******3210', $7, $8::jsonb,
         $9, 'Verification Admin', 'Admin', 'Delivered', $10, 'MOCK',
         now(), now()
       )`,
      [
        jobId,
        ids.school,
        deviceId,
        whatsappTemplateId,
        idempotencyKey,
        `${prefix}_student`,
        encryptedPhone,
        JSON.stringify({ student_name: "Verification Student" }),
        ids.admin,
        `mock_whatsapp_${prefix}`,
      ],
    );
    await client.query("savepoint duplicate_communication_job");
    let duplicateCommunicationJobRejected = false;
    try {
      await client.query(
        `insert into communication_jobs (
           id, school_id, device_id, channel, provider, template_id,
           idempotency_key, recipient_type, recipient_entity_id,
           recipient_name, recipient_phone_masked, encrypted_recipient_phone,
           variables, status
         )
         values ($1, $2, $3, 'WhatsApp', 'MetaCloud', $4, $5, 'Student', $6, 'Duplicate', '+91******3210', $7, '{}'::jsonb, 'Queued')`,
        [
          randomUUID(),
          ids.school,
          deviceId,
          whatsappTemplateId,
          idempotencyKey,
          `${prefix}_student`,
          encryptedPhone,
        ],
      );
    } catch (error) {
      duplicateCommunicationJobRejected = /duplicate|unique/i.test(String(error.message));
      await client.query("rollback to savepoint duplicate_communication_job");
    }
    await client.query("release savepoint duplicate_communication_job");
    assert.equal(
      duplicateCommunicationJobRejected,
      true,
      "duplicate communication idempotency key should be rejected",
    );

    const batchId = randomUUID();
    await client.query(
      `insert into communication_batches (
         id, school_id, channel, template_id, title, audience_type,
         total_recipients, queued_count, delivered_count, requested_by_user_id
       )
       values ($1, $2, 'SMS', $3, $4, 'Specific Class', 1, 0, 1, $5)`,
      [batchId, ids.school, smsTemplateId, `${prefix} SMS batch`, ids.admin],
    );
    const smsJobId = randomUUID();
    await client.query(
      `insert into communication_jobs (
         id, school_id, batch_id, device_id, channel, provider, template_id,
         idempotency_key, recipient_type, recipient_entity_id, recipient_name,
         recipient_phone_masked, encrypted_recipient_phone, variables,
         requested_by_user_id, requested_by_name, requested_by_role, status,
         provider_message_id, provider_response_code, submitted_at, delivered_at
       )
       values (
         $1, $2, $3, $4, 'SMS', 'MSG91', $5, $6, 'Guardian', $7,
         'Verification Guardian', '+91******3210', $8, $9::jsonb,
         $10, 'Verification Admin', 'Admin', 'Delivered', $11, 'MOCK', now(), now()
       )`,
      [
        smsJobId,
        ids.school,
        batchId,
        deviceId,
        smsTemplateId,
        `${prefix}_sms_idempotency`,
        `${prefix}_guardian`,
        encryptedPhone,
        JSON.stringify({ receipt_no: "RC-1" }),
        ids.admin,
        `mock_sms_${prefix}`,
      ],
    );
    const mockJobs = await client.query(
      `select channel, provider_message_id, status
       from communication_jobs
       where id in ($1, $2)
       order by channel`,
      [jobId, smsJobId],
    );
    assert.equal(mockJobs.rowCount, 2, "mock WhatsApp and SMS jobs should persist");
    assert.equal(
      mockJobs.rows.every((row) => String(row.provider_message_id).startsWith("mock_") && row.status === "Delivered"),
      true,
      "mock communication jobs should have mock provider IDs and delivered status",
    );

    const webhookEventId = `${prefix}_webhook_event`;
    await client.query(
      `insert into communication_webhook_events (
         id, school_id, provider, provider_event_id, event_type,
         provider_message_id, payload_hash, payload_json, processing_status,
         processed_at
       )
       values ($1, $2, 'MetaCloud', $3, 'message_status', $4, $5, $6::jsonb, 'Processed', now())`,
      [
        randomUUID(),
        ids.school,
        webhookEventId,
        `mock_whatsapp_${prefix}`,
        createHash("sha256").update(webhookEventId).digest("hex"),
        JSON.stringify({ status: "delivered" }),
      ],
    );
    await client.query("savepoint duplicate_webhook_event");
    let duplicateWebhookRejected = false;
    try {
      await client.query(
        `insert into communication_webhook_events (
           id, school_id, provider, provider_event_id, event_type,
           provider_message_id, payload_hash, payload_json, processing_status
         )
         values ($1, $2, 'MetaCloud', $3, 'message_status', $4, $5, '{}'::jsonb, 'Duplicate')`,
        [
          randomUUID(),
          ids.school,
          webhookEventId,
          `mock_whatsapp_${prefix}`,
          createHash("sha256").update(`${webhookEventId}:2`).digest("hex"),
        ],
      );
    } catch (error) {
      duplicateWebhookRejected = /duplicate|unique/i.test(String(error.message));
      await client.query("rollback to savepoint duplicate_webhook_event");
    }
    await client.query("release savepoint duplicate_webhook_event");
    assert.equal(
      duplicateWebhookRejected,
      true,
      "duplicate webhook event should be rejected",
    );

    await client.query(
      `insert into communication_contact_preferences (
         id, school_id, entity_type, entity_id, phone_masked,
         whatsapp_enabled, sms_enabled, transactional_allowed,
         opted_out_at, opt_out_reason
       )
       values ($1, $2, 'Guardian', $3, '+91******3210', false, false, false, now(), 'Verification opt-out')`,
      [randomUUID(), ids.school, `${prefix}_guardian`],
    );
    const optedOut = await client.query(
      `select whatsapp_enabled, sms_enabled, transactional_allowed, opted_out_at
       from communication_contact_preferences
       where school_id = $1 and entity_id = $2`,
      [ids.school, `${prefix}_guardian`],
    );
    assert.equal(
      optedOut.rows[0].whatsapp_enabled || optedOut.rows[0].sms_enabled || optedOut.rows[0].transactional_allowed,
      false,
      "communication opt-out preferences should persist",
    );

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
