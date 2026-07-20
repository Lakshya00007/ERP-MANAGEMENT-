import "server-only";

import { randomUUID } from "node:crypto";
import { getCommunicationProviderMode } from "@/lib/env";
import { getDb, queryOne, queryRows, sql } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { decryptJson, encryptJson, generateCommunicationToken } from "@/lib/communications/crypto";
import { maskPhone, normalizeIndianPhone } from "@/lib/communications/phone";
import { sendMockMessage, testMockConnection } from "@/lib/communications/providers/mock";
import * as metaWhatsapp from "@/lib/communications/providers/meta-whatsapp";
import * as msg91Sms from "@/lib/communications/providers/msg91-sms";
import type {
  CommunicationChannel,
  CommunicationIntegrationRow,
  CommunicationJobRow,
  CommunicationProvider,
  CommunicationTemplateRow,
  DeviceAuthContext,
} from "@/lib/communications/types";

const PROVIDER_BY_CHANNEL: Record<CommunicationChannel, CommunicationProvider> = {
  WhatsApp: "MetaCloud",
  SMS: "MSG91",
};
const MAX_BATCH_SIZE = 250;
const MAX_ATTEMPTS = 3;

type SendInput = {
  channel?: CommunicationChannel;
  templateId?: string;
  recipient?: {
    type?: string;
    entityId?: string;
    name?: string;
    phone?: string;
  };
  variables?: Record<string, unknown>;
  mediaUrl?: string;
  idempotencyKey?: string;
  requestedBy?: {
    userId?: string;
    name?: string;
    role?: string;
  };
};

type BatchInput = {
  channel?: CommunicationChannel;
  templateId?: string;
  title?: string;
  audienceType?: string;
  recipients?: Array<NonNullable<SendInput["recipient"]> & { variables?: Record<string, unknown> }>;
  variables?: Record<string, unknown>;
  idempotencyKey?: string;
  requestedBy?: SendInput["requestedBy"];
};

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeJson(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeChannel(value: unknown): CommunicationChannel {
  if (value === "WhatsApp" || value === "SMS") return value;
  throw new Error("channel must be WhatsApp or SMS");
}

function canRequestTemplate(role: string, category: string | null) {
  if (role === "Owner" || role === "Admin") return true;
  if (role === "Student" || role === "Viewer") return false;
  const normalizedCategory = (category ?? "").toLowerCase();
  if (role === "Accountant") {
    return /fee|receipt|payment|general utility/.test(normalizedCategory);
  }
  if (role === "Teacher") {
    return /absence|attendance|homework|exam|result|announcement|emergency|general utility/.test(normalizedCategory);
  }
  return false;
}

function safeTemplate(row: CommunicationTemplateRow) {
  return {
    id: row.id,
    channel: row.channel,
    provider: row.provider,
    internalName: row.internal_name,
    category: row.category,
    providerTemplateId: row.provider_template_id,
    providerTemplateName: row.provider_template_name,
    providerLanguageCode: row.provider_language_code,
    dltTemplateId: row.dlt_template_id,
    msg91FlowId: row.msg91_flow_id,
    senderId: row.sender_id,
    bodyPreview: row.body_preview,
    variableDefinitions: row.variable_definitions ?? [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeJob(row: CommunicationJobRow) {
  return {
    id: row.id,
    batchId: row.batch_id,
    channel: row.channel,
    provider: row.provider,
    templateId: row.template_id,
    recipientType: row.recipient_type,
    recipientEntityId: row.recipient_entity_id,
    recipientName: row.recipient_name,
    recipientPhoneMasked: row.recipient_phone_masked,
    requestedByName: row.requested_by_name,
    requestedByRole: row.requested_by_role,
    status: row.status,
    providerMessageId: row.provider_message_id,
    providerResponseCode: row.provider_response_code,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    attemptCount: row.attempt_count,
    queuedAt: row.queued_at,
    submittedAt: row.submitted_at,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function displayConfigFor(channel: CommunicationChannel, config: Record<string, unknown>) {
  if (channel === "WhatsApp") {
    return {
      phoneNumberId: safeText(config.phoneNumberId),
      wabaId: safeText(config.wabaId),
      displayNumber: maskPhone(safeText(config.displayNumber)),
      defaultLanguageCode: safeText(config.defaultLanguageCode, "en"),
      hasAccessToken: Boolean(safeText(config.accessToken)),
    };
  }

  return {
    senderId: safeText(config.senderId),
    principalEntityId: safeText(config.principalEntityId),
    countryCode: safeText(config.countryCode, "91"),
    hasAuthKey: Boolean(safeText(config.authKey)),
  };
}

export async function generateDeviceToken(input: {
  adminId: string;
  schoolId: string;
  deviceId: string;
  licenseId: string;
  expiresAt?: string | null;
}) {
  const device = await queryOne<{ device_id: string }>(
    `select device_id from devices where school_id = $1 and device_id = $2 and status = 'Active'`,
    [input.schoolId, input.deviceId],
  );
  if (!device) {
    throw new Error("Active device not found for this school");
  }

  const license = await queryOne<{ license_id: string; status: string; expires_at: string | null }>(
    `select license_id, status, expires_at
     from licenses
     where school_id = $1 and device_id = $2 and license_id = $3`,
    [input.schoolId, input.deviceId, input.licenseId],
  );
  if (!license || license.status !== "Active") {
    throw new Error("Active license not found for this school and device");
  }
  if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) {
    throw new Error("License is expired");
  }

  const token = generateCommunicationToken();
  const id = randomUUID();
  await getDb().transaction((tx) => [
    tx`
      insert into communication_device_tokens (
        id, school_id, license_id, device_id, token_hash, token_prefix,
        expires_at, created_by_admin_id
      )
      values (
        ${id}, ${input.schoolId}, ${input.licenseId}, ${input.deviceId},
        ${token.tokenHash}, ${token.tokenPrefix}, ${input.expiresAt ?? null}, ${input.adminId}
      )
    `,
    tx`
      insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
      values (
        ${randomUUID()}, ${input.adminId}, ${"communication.device_token.generated"},
        ${"communication_device_token"}, ${id},
        ${JSON.stringify({
          schoolId: input.schoolId,
          deviceId: input.deviceId,
          licenseId: input.licenseId,
          tokenPrefix: token.tokenPrefix,
        })}::jsonb
      )
    `,
  ]);

  return {
    id,
    rawToken: token.rawToken,
    tokenPrefix: token.tokenPrefix,
    expiresAt: input.expiresAt ?? null,
  };
}

export async function revokeDeviceToken(input: {
  adminId: string;
  tokenId: string;
  reason?: string | null;
}) {
  await getDb().transaction((tx) => [
    tx`
      update communication_device_tokens
      set status = ${"Revoked"}, revoked_at = now(), revoked_reason = ${input.reason ?? null}
      where id = ${input.tokenId}
    `,
    tx`
      insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
      values (
        ${randomUUID()}, ${input.adminId}, ${"communication.device_token.revoked"},
        ${"communication_device_token"}, ${input.tokenId},
        ${JSON.stringify({ reason: input.reason ?? null })}::jsonb
      )
    `,
  ]);
}

export async function saveIntegration(input: {
  adminId: string;
  schoolId: string;
  channel: CommunicationChannel;
  provider: CommunicationProvider;
  status: string;
  config: Record<string, unknown>;
}) {
  const existing = await queryOne<CommunicationIntegrationRow>(
    `select *
     from communication_integrations
     where school_id = $1 and channel = $2 and provider = $3 and status in ('Configured', 'Active', 'Error')
     order by created_at desc
     limit 1`,
    [input.schoolId, input.channel, input.provider],
  );
  const existingConfig = existing ? decryptJson<Record<string, unknown>>(existing.encrypted_config) : {};
  const mergedConfig = {
    ...existingConfig,
    ...Object.fromEntries(Object.entries(input.config).filter(([, value]) => safeText(value) !== "")),
  };
  const encryptedConfig = encryptJson(mergedConfig);
  const displayConfig = displayConfigFor(input.channel, mergedConfig);
  const status = ["Disabled", "Configured", "Active", "Error"].includes(input.status)
    ? input.status
    : "Configured";

  if (existing) {
    await sql`
      update communication_integrations
      set encrypted_config = ${encryptedConfig},
          display_config = ${JSON.stringify(displayConfig)}::jsonb,
          status = ${status}
      where id = ${existing.id}
    `;
  } else {
    await sql`
      insert into communication_integrations (
        id, school_id, channel, provider, status, encrypted_config, display_config
      )
      values (
        ${randomUUID()}, ${input.schoolId}, ${input.channel}, ${input.provider}, ${status},
        ${encryptedConfig}, ${JSON.stringify(displayConfig)}::jsonb
      )
    `;
  }

  await writeAuditLog({
    actorId: input.adminId,
    action: "communication.integration.configured",
    entityType: "communication_integration",
    entityId: `${input.schoolId}:${input.channel}`,
    details: { schoolId: input.schoolId, channel: input.channel, provider: input.provider, displayConfig },
  });
}

export async function testIntegration(input: {
  adminId: string;
  schoolId: string;
  channel: CommunicationChannel;
}) {
  const integration = await getActiveIntegration(input.schoolId, input.channel);
  if (!integration) {
    throw new Error(`${input.channel} integration is not configured`);
  }

  let result: { ok: boolean; mode?: string };
  try {
    if (getCommunicationProviderMode() === "mock") {
      result = await testMockConnection();
    } else if (input.channel === "WhatsApp") {
      result = await metaWhatsapp.testConnection(decryptJson(integration.encrypted_config));
    } else {
      result = await msg91Sms.testConnection(decryptJson(integration.encrypted_config));
    }
    await sql`
      update communication_integrations
      set last_tested_at = now(), last_test_status = ${"Success"}, last_test_error = ${null}, status = ${"Active"}
      where id = ${integration.id}
    `;
  } catch (error) {
    await sql`
      update communication_integrations
      set last_tested_at = now(), last_test_status = ${"Failed"}, last_test_error = ${String(error instanceof Error ? error.message : error)}, status = ${"Error"}
      where id = ${integration.id}
    `;
    throw error;
  }

  await writeAuditLog({
    actorId: input.adminId,
    action: "communication.integration.tested",
    entityType: "communication_integration",
    entityId: integration.id,
    details: { schoolId: input.schoolId, channel: input.channel, mode: getCommunicationProviderMode() },
  });
  return result;
}

export async function saveTemplate(input: {
  adminId: string;
  schoolId: string;
  channel: CommunicationChannel;
  internalName: string;
  category?: string | null;
  providerTemplateId?: string | null;
  providerTemplateName?: string | null;
  providerLanguageCode?: string | null;
  dltTemplateId?: string | null;
  msg91FlowId?: string | null;
  senderId?: string | null;
  bodyPreview?: string | null;
  variableDefinitions?: unknown;
  status?: string | null;
}) {
  const provider = PROVIDER_BY_CHANNEL[input.channel];
  const id = randomUUID();
  const status = ["Draft", "Pending", "Approved", "Rejected", "Disabled"].includes(input.status ?? "")
    ? input.status
    : "Draft";

  await sql`
    insert into communication_templates (
      id, school_id, channel, provider, internal_name, category, provider_template_id,
      provider_template_name, provider_language_code, dlt_template_id, msg91_flow_id,
      sender_id, body_preview, variable_definitions, status
    )
    values (
      ${id}, ${input.schoolId}, ${input.channel}, ${provider}, ${input.internalName},
      ${input.category ?? null}, ${input.providerTemplateId ?? null},
      ${input.providerTemplateName ?? null}, ${input.providerLanguageCode ?? null},
      ${input.dltTemplateId ?? null}, ${input.msg91FlowId ?? null}, ${input.senderId ?? null},
      ${input.bodyPreview ?? null}, ${JSON.stringify(input.variableDefinitions ?? [])}::jsonb, ${status}
    )
    on conflict (school_id, channel, internal_name)
    do update set
      provider_template_id = excluded.provider_template_id,
      provider_template_name = excluded.provider_template_name,
      provider_language_code = excluded.provider_language_code,
      dlt_template_id = excluded.dlt_template_id,
      msg91_flow_id = excluded.msg91_flow_id,
      sender_id = excluded.sender_id,
      body_preview = excluded.body_preview,
      variable_definitions = excluded.variable_definitions,
      category = excluded.category,
      status = excluded.status
  `;

  await writeAuditLog({
    actorId: input.adminId,
    action: "communication.template.saved",
    entityType: "communication_template",
    entityId: id,
    details: { schoolId: input.schoolId, channel: input.channel, internalName: input.internalName, status },
  });
}

export async function getSafeIntegrationStatus(context: DeviceAuthContext) {
  const rows = await queryRows<Omit<CommunicationIntegrationRow, "encrypted_config">>(
    `select id, school_id, channel, provider, status, display_config, last_tested_at,
            last_test_status, last_test_error, created_at, updated_at
     from communication_integrations
     where school_id = $1
     order by channel, provider`,
    [context.schoolId],
  );

  return {
    mode: getCommunicationProviderMode(),
    schoolId: context.schoolId,
    schoolName: context.schoolName,
    deviceId: context.deviceId,
    integrations: rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      provider: row.provider,
      status: row.status,
      displayConfig: row.display_config ?? {},
      lastTestedAt: row.last_tested_at,
      lastTestStatus: row.last_test_status,
      lastTestError: row.last_test_error,
    })),
  };
}

export async function getTemplates(context: DeviceAuthContext, channel?: CommunicationChannel) {
  const rows = await queryRows<CommunicationTemplateRow>(
    `select *
     from communication_templates
     where school_id = $1
       and ($2::text is null or channel = $2)
       and status <> 'Disabled'
     order by channel, category nulls last, internal_name`,
    [context.schoolId, channel ?? null],
  );
  return rows.map(safeTemplate);
}

async function getTemplate(schoolId: string, templateId: string) {
  return queryOne<CommunicationTemplateRow>(
    `select * from communication_templates where school_id = $1 and id = $2`,
    [schoolId, templateId],
  );
}

async function getActiveIntegration(schoolId: string, channel: CommunicationChannel) {
  return queryOne<CommunicationIntegrationRow>(
    `select *
     from communication_integrations
     where school_id = $1 and channel = $2 and status in ('Configured', 'Active')
     order by case when status = 'Active' then 0 else 1 end, updated_at desc
     limit 1`,
    [schoolId, channel],
  );
}

async function assertContactPreference(input: {
  schoolId: string;
  channel: CommunicationChannel;
  entityType: string;
  entityId: string;
}) {
  const preference = await queryOne<{
    whatsapp_enabled: boolean;
    sms_enabled: boolean;
    transactional_allowed: boolean;
    opted_out_at: string | null;
  }>(
    `select whatsapp_enabled, sms_enabled, transactional_allowed, opted_out_at
     from communication_contact_preferences
     where school_id = $1 and entity_type = $2 and entity_id = $3`,
    [input.schoolId, input.entityType, input.entityId],
  );

  if (!preference) return;
  if (preference.opted_out_at || !preference.transactional_allowed) {
    throw new Error("Recipient has opted out of school-operation communication");
  }
  if (input.channel === "WhatsApp" && !preference.whatsapp_enabled) {
    throw new Error("Recipient has disabled WhatsApp communication");
  }
  if (input.channel === "SMS" && !preference.sms_enabled) {
    throw new Error("Recipient has disabled SMS communication");
  }
}

export async function createCommunicationJob(context: DeviceAuthContext, input: SendInput) {
  const channel = normalizeChannel(input.channel);
  const templateId = safeText(input.templateId);
  const recipient = input.recipient ?? {};
  const requestedByRole = safeText(input.requestedBy?.role);
  const requestedByName = safeText(input.requestedBy?.name);
  const requestedByUserId = safeText(input.requestedBy?.userId);
  const recipientType = safeText(recipient.type);
  const recipientEntityId = safeText(recipient.entityId);
  const recipientName = safeText(recipient.name);
  const idempotencyKey = safeText(input.idempotencyKey) || null;

  if (!templateId) throw new Error("templateId is required");
  if (!recipientType || !recipientEntityId || !recipientName) {
    throw new Error("Recipient type, entity ID and name are required");
  }

  if (idempotencyKey) {
    const existing = await queryOne<CommunicationJobRow>(
      `select * from communication_jobs where school_id = $1 and idempotency_key = $2`,
      [context.schoolId, idempotencyKey],
    );
    if (existing) {
      return { job: safeJob(existing), duplicate: true };
    }
  }

  const template = await getTemplate(context.schoolId, templateId);
  if (!template || template.channel !== channel || template.status !== "Approved") {
    throw new Error("Approved communication template not found");
  }
  if (!canRequestTemplate(requestedByRole, template.category)) {
    throw new Error("Current user role cannot send this communication template");
  }

  const integration = await getActiveIntegration(context.schoolId, channel);
  if (!integration) {
    throw new Error(`${channel} integration is not active`);
  }

  await assertContactPreference({
    schoolId: context.schoolId,
    channel,
    entityType: recipientType,
    entityId: recipientEntityId,
  });

  const normalizedPhone = normalizeIndianPhone(recipient.phone);
  const id = randomUUID();
  await sql`
    insert into communication_jobs (
      id, school_id, device_id, channel, provider, template_id, idempotency_key,
      recipient_type, recipient_entity_id, recipient_name, recipient_phone_masked,
      encrypted_recipient_phone, variables, media_url, requested_by_user_id,
      requested_by_name, requested_by_role
    )
    values (
      ${id}, ${context.schoolId}, ${context.deviceId}, ${channel}, ${integration.provider},
      ${template.id}, ${idempotencyKey}, ${recipientType}, ${recipientEntityId},
      ${recipientName}, ${normalizedPhone.masked}, ${encryptJson({ phone: normalizedPhone.e164 })},
      ${JSON.stringify(input.variables ?? {})}::jsonb, ${safeText(input.mediaUrl) || null},
      ${requestedByUserId || null}, ${requestedByName || null}, ${requestedByRole || null}
    )
  `;
  await writeAuditLog({
    actorId: null,
    action: "communication.message.queued",
    entityType: "communication_job",
    entityId: id,
    details: {
      schoolId: context.schoolId,
      channel,
      templateId: template.id,
      recipientType,
      recipientPhoneMasked: normalizedPhone.masked,
    },
  });

  await processQueuedJobs(context.schoolId, 1);

  const created = await queryOne<CommunicationJobRow>(`select * from communication_jobs where id = $1`, [id]);
  if (!created) throw new Error("Communication job was not created");
  return { job: safeJob(created), duplicate: false };
}

export async function createCommunicationBatch(context: DeviceAuthContext, input: BatchInput) {
  const channel = normalizeChannel(input.channel);
  const templateId = safeText(input.templateId);
  const recipients = Array.isArray(input.recipients) ? input.recipients : [];
  const requestedByRole = safeText(input.requestedBy?.role);

  if (!templateId) throw new Error("templateId is required");
  if (recipients.length === 0) throw new Error("At least one recipient is required");
  if (recipients.length > MAX_BATCH_SIZE) throw new Error(`Batch size cannot exceed ${MAX_BATCH_SIZE}`);

  const template = await getTemplate(context.schoolId, templateId);
  if (!template || template.channel !== channel || template.status !== "Approved") {
    throw new Error("Approved communication template not found");
  }
  if (!canRequestTemplate(requestedByRole, template.category)) {
    throw new Error("Current user role cannot send this communication template");
  }
  const integration = await getActiveIntegration(context.schoolId, channel);
  if (!integration) throw new Error(`${channel} integration is not active`);

  const seenPhones = new Set<string>();
  const valid: Array<{
    recipient: NonNullable<SendInput["recipient"]>;
    variables: Record<string, unknown>;
    phone: string;
    masked: string;
  }> = [];
  const excluded: Array<{ name: string; reason: string }> = [];

  for (const recipient of recipients) {
    try {
      const normalized = normalizeIndianPhone(recipient.phone);
      if (seenPhones.has(normalized.e164)) {
        excluded.push({ name: safeText(recipient.name, "Recipient"), reason: "Duplicate phone" });
        continue;
      }
      await assertContactPreference({
        schoolId: context.schoolId,
        channel,
        entityType: safeText(recipient.type),
        entityId: safeText(recipient.entityId),
      });
      seenPhones.add(normalized.e164);
      valid.push({
        recipient,
        variables: { ...(input.variables ?? {}), ...(recipient.variables ?? {}) },
        phone: normalized.e164,
        masked: normalized.masked,
      });
    } catch (error) {
      excluded.push({
        name: safeText(recipient.name, "Recipient"),
        reason: error instanceof Error ? error.message : "Invalid recipient",
      });
    }
  }

  const batchId = randomUUID();
  const db = getDb();
  await db.transaction((tx) => {
    const operations = [
      tx`
        insert into communication_batches (
          id, school_id, channel, template_id, title, audience_type,
          total_recipients, queued_count, requested_by_user_id
        )
        values (
          ${batchId}, ${context.schoolId}, ${channel}, ${template.id},
          ${safeText(input.title) || null}, ${safeText(input.audienceType) || null},
          ${valid.length}, ${valid.length}, ${safeText(input.requestedBy?.userId) || null}
        )
      `,
    ];
    for (const item of valid) {
      operations.push(tx`
        insert into communication_jobs (
          id, school_id, batch_id, device_id, channel, provider, template_id,
          idempotency_key, recipient_type, recipient_entity_id, recipient_name,
          recipient_phone_masked, encrypted_recipient_phone, variables, requested_by_user_id,
          requested_by_name, requested_by_role
        )
        values (
          ${randomUUID()}, ${context.schoolId}, ${batchId}, ${context.deviceId},
          ${channel}, ${integration.provider}, ${template.id},
          ${safeText(input.idempotencyKey) ? `${input.idempotencyKey}:${item.phone}` : null},
          ${safeText(item.recipient.type)}, ${safeText(item.recipient.entityId)},
          ${safeText(item.recipient.name)}, ${item.masked}, ${encryptJson({ phone: item.phone })},
          ${JSON.stringify(item.variables)}::jsonb, ${safeText(input.requestedBy?.userId) || null},
          ${safeText(input.requestedBy?.name) || null}, ${requestedByRole || null}
        )
        on conflict do nothing
      `);
    }
    return operations;
  });

  await writeAuditLog({
    actorId: null,
    action: "communication.batch.created",
    entityType: "communication_batch",
    entityId: batchId,
    details: { schoolId: context.schoolId, channel, templateId, recipientCount: valid.length, excludedCount: excluded.length },
  });
  await processQueuedJobs(context.schoolId, Math.min(10, valid.length));

  return {
    batchId,
    totalRecipients: recipients.length,
    queuedCount: valid.length,
    excluded,
  };
}

async function processOneJob(row: CommunicationJobRow) {
  const template = row.template_id ? await getTemplate(row.school_id, row.template_id) : null;
  const integration = await getActiveIntegration(row.school_id, row.channel);
  if (!template || !integration) {
    await markJobFailed(row.id, "CONFIGURATION", "Template or integration is no longer active");
    return;
  }

  const phone = decryptJson<{ phone?: string }>(row.encrypted_recipient_phone)?.phone;
  if (!phone) {
    await markJobFailed(row.id, "INVALID_PHONE", "Recipient phone is unavailable");
    return;
  }

  await sql`
    update communication_jobs
    set status = ${"Processing"}, attempt_count = attempt_count + 1
    where id = ${row.id}
  `;

  try {
    let result: { providerMessageId: string | null; providerResponseCode: string; rawStatus: string };
    if (getCommunicationProviderMode() === "mock") {
      result = await sendMockMessage(row.channel, row.id);
    } else if (row.channel === "WhatsApp") {
      result = await metaWhatsapp.sendTemplateMessage(decryptJson(integration.encrypted_config), {
        to: phone,
        templateName: template.provider_template_name || template.provider_template_id || "",
        languageCode: template.provider_language_code,
        variables: safeJson(row.variables),
        mediaUrl: row.media_url,
      });
    } else {
      result = await msg91Sms.sendTemplateSms(decryptJson(integration.encrypted_config), {
        to: phone,
        flowId: template.msg91_flow_id || template.provider_template_id || "",
        senderId: template.sender_id,
        variables: safeJson(row.variables),
      });
    }

    const mockDelivered = getCommunicationProviderMode() === "mock";
    await sql`
      update communication_jobs
      set status = ${mockDelivered ? "Delivered" : "Submitted"},
          provider_message_id = ${result.providerMessageId},
          provider_response_code = ${result.providerResponseCode},
          submitted_at = coalesce(submitted_at, now()),
          sent_at = case when ${mockDelivered} then coalesce(sent_at, now()) else sent_at end,
          delivered_at = case when ${mockDelivered} then coalesce(delivered_at, now()) else delivered_at end,
          error_code = null,
          error_message = null
      where id = ${row.id}
    `;
  } catch (error) {
    await markJobFailed(row.id, "PROVIDER_ERROR", error instanceof Error ? error.message : "Provider send failed");
  }
}

async function markJobFailed(jobId: string, code: string, message: string) {
  await sql`
    update communication_jobs
    set status = ${"Failed"}, error_code = ${code}, error_message = ${message.slice(0, 500)}, failed_at = now()
    where id = ${jobId}
  `;
}

export async function processQueuedJobs(schoolId?: string, limit = 20) {
  const rows = await queryRows<CommunicationJobRow>(
    `select *
     from communication_jobs
     where status = 'Queued'
       and ($1::uuid is null or school_id = $1)
       and attempt_count < $2
     order by queued_at asc
     limit $3`,
    [schoolId ?? null, MAX_ATTEMPTS, Math.max(1, Math.min(50, limit))],
  );

  for (const row of rows) {
    await processOneJob(row);
  }

  await refreshBatchCounts();
  return { processed: rows.length };
}

async function refreshBatchCounts(batchId?: string) {
  await sql`
    update communication_batches b
    set queued_count = counts.queued_count,
        submitted_count = counts.submitted_count,
        delivered_count = counts.delivered_count,
        read_count = counts.read_count,
        failed_count = counts.failed_count
    from (
      select
        batch_id,
        count(*) filter (where status = 'Queued')::int as queued_count,
        count(*) filter (where status in ('Submitted', 'Sent'))::int as submitted_count,
        count(*) filter (where status = 'Delivered')::int as delivered_count,
        count(*) filter (where status = 'Read')::int as read_count,
        count(*) filter (where status in ('Failed', 'Rejected'))::int as failed_count
      from communication_jobs
      where batch_id is not null
        and (${batchId ?? null}::uuid is null or batch_id = ${batchId ?? null})
      group by batch_id
    ) counts
    where b.id = counts.batch_id
  `;
}

export async function getJobs(context: DeviceAuthContext, filter: Record<string, unknown> = {}) {
  const channel = filter.channel === "WhatsApp" || filter.channel === "SMS" ? filter.channel : null;
  const status = safeText(filter.status);
  const rows = await queryRows<CommunicationJobRow>(
    `select *
     from communication_jobs
     where school_id = $1
       and ($2::text is null or channel = $2)
       and ($3::text = '' or status = $3)
     order by created_at desc
     limit 200`,
    [context.schoolId, channel, status],
  );
  return rows.map(safeJob);
}

export async function getJob(context: DeviceAuthContext, id: string) {
  const row = await queryOne<CommunicationJobRow>(
    `select * from communication_jobs where school_id = $1 and id = $2`,
    [context.schoolId, id],
  );
  if (!row) throw new Error("Communication job not found");
  return safeJob(row);
}

export async function getBatch(context: DeviceAuthContext, id: string) {
  const row = await queryOne<Record<string, unknown>>(
    `select * from communication_batches where school_id = $1 and id = $2`,
    [context.schoolId, id],
  );
  if (!row) throw new Error("Communication batch not found");
  return row;
}

export async function retryJob(context: DeviceAuthContext, id: string, requestedByRole = "") {
  if (!["Owner", "Admin"].includes(requestedByRole)) {
    throw new Error("Only Owner/Admin can retry communication jobs");
  }
  const row = await queryOne<CommunicationJobRow>(
    `select * from communication_jobs where school_id = $1 and id = $2`,
    [context.schoolId, id],
  );
  if (!row) throw new Error("Communication job not found");
  if (row.status !== "Failed" || row.attempt_count >= MAX_ATTEMPTS) {
    throw new Error("Only failed retryable jobs can be retried");
  }
  await sql`
    update communication_jobs
    set status = ${"Queued"}, error_code = null, error_message = null
    where id = ${id}
  `;
  await processQueuedJobs(context.schoolId, 1);
  return getJob(context, id);
}

export async function applyProviderStatusUpdate(input: {
  provider: CommunicationProvider;
  providerEventId: string | null;
  providerMessageId: string;
  status: string;
  payloadHash: string;
  payloadJson: unknown;
  errorMessage?: string;
}) {
  const existing = await queryOne<{ id: string }>(
    `select id
     from communication_webhook_events
     where provider = $1 and (
       (provider_event_id is not null and provider_event_id = $2)
       or (provider_event_id is null and payload_hash = $3)
     )`,
    [input.provider, input.providerEventId, input.payloadHash],
  );
  if (existing) {
    return { duplicate: true };
  }

  const job = await queryOne<CommunicationJobRow>(
    `select * from communication_jobs where provider_message_id = $1 order by created_at desc limit 1`,
    [input.providerMessageId],
  );
  await getDb().transaction((tx) => [
    tx`
      insert into communication_webhook_events (
        id, school_id, provider, provider_event_id, event_type, provider_message_id,
        payload_hash, payload_json, processing_status, error_message, processed_at
      )
      values (
        ${randomUUID()}, ${job?.school_id ?? null}, ${input.provider}, ${input.providerEventId},
        ${"message_status"}, ${input.providerMessageId}, ${input.payloadHash},
        ${JSON.stringify(input.payloadJson)}::jsonb, ${job ? "Processed" : "Orphaned"},
        ${input.errorMessage ?? null}, now()
      )
    `,
    ...(job
      ? [
          tx`
            update communication_jobs
            set status = ${input.status},
                sent_at = case when ${input.status} in ('Sent', 'Delivered', 'Read') then coalesce(sent_at, now()) else sent_at end,
                delivered_at = case when ${input.status} in ('Delivered', 'Read') then coalesce(delivered_at, now()) else delivered_at end,
                read_at = case when ${input.status} = 'Read' then coalesce(read_at, now()) else read_at end,
                failed_at = case when ${input.status} = 'Failed' then coalesce(failed_at, now()) else failed_at end,
                error_message = ${input.errorMessage ?? null}
            where id = ${job.id}
          `,
        ]
      : []),
  ]);
  if (job?.batch_id) await refreshBatchCounts(job.batch_id);
  return { duplicate: false };
}
