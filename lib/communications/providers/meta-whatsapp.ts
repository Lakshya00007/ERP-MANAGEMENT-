import "server-only";

import crypto from "node:crypto";
import { getMetaAppSecret, getMetaGraphApiVersion } from "@/lib/env";

type MetaConfig = {
  phoneNumberId?: string;
  wabaId?: string;
  accessToken?: string;
  displayNumber?: string;
  defaultLanguageCode?: string;
};

type SendTemplateInput = {
  to: string;
  templateName: string;
  languageCode?: string | null;
  variables?: Record<string, unknown> | null;
  mediaUrl?: string | null;
};

function variableComponents(variables: Record<string, unknown> | null | undefined, mediaUrl?: string | null) {
  const bodyVariables = Object.keys(variables ?? {})
    .sort()
    .map((key) => ({
      type: "text",
      text: String(variables?.[key] ?? ""),
    }));
  const components: Array<Record<string, unknown>> = [];

  if (mediaUrl) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "document",
          document: { link: mediaUrl },
        },
      ],
    });
  }

  if (bodyVariables.length) {
    components.push({ type: "body", parameters: bodyVariables });
  }

  return components;
}

export async function testConnection(config: MetaConfig) {
  if (!config.phoneNumberId || !config.accessToken) {
    throw new Error("WhatsApp Phone Number ID and access token are required");
  }

  const response = await fetch(
    `https://graph.facebook.com/${getMetaGraphApiVersion()}/${config.phoneNumberId}`,
    {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(maskProviderError(await response.text()));
  }

  return { ok: true };
}

export async function sendTemplateMessage(config: MetaConfig, input: SendTemplateInput) {
  if (!config.phoneNumberId || !config.accessToken) {
    throw new Error("WhatsApp integration is missing Phone Number ID or access token");
  }

  const payload = {
    messaging_product: "whatsapp",
    to: input.to.replace(/^\+/, ""),
    type: "template",
    template: {
      name: input.templateName,
      language: {
        code: input.languageCode || config.defaultLanguageCode || "en",
      },
      components: variableComponents(input.variables, input.mediaUrl),
    },
  };

  const response = await fetch(
    `https://graph.facebook.com/${getMetaGraphApiVersion()}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(maskProviderError(JSON.stringify(body)));
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const first = messages[0] as { id?: string } | undefined;

  return {
    providerMessageId: first?.id ?? null,
    providerResponseCode: String(response.status),
    rawStatus: "submitted",
  };
}

export async function sendMediaTemplateMessage(config: MetaConfig, input: SendTemplateInput) {
  return sendTemplateMessage(config, input);
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const secret = getMetaAppSecret();
  if (!secret) {
    return false;
  }
  const signature = signatureHeader?.replace(/^sha256=/, "") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export function parseWebhook(payload: Record<string, unknown>) {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const events: Array<{
    providerEventId: string;
    providerMessageId: string;
    eventType: string;
    status: string;
    errorMessage?: string;
  }> = [];

  for (const entry of entries as Array<Record<string, unknown>>) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes as Array<Record<string, unknown>>) {
      const value = change.value as Record<string, unknown> | undefined;
      const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
      for (const statusEvent of statuses as Array<Record<string, unknown>>) {
        const id = String(statusEvent.id ?? "");
        const status = String(statusEvent.status ?? "");
        if (!id || !status) continue;
        const errors = Array.isArray(statusEvent.errors) ? statusEvent.errors : [];
        const firstError = errors[0] as Record<string, unknown> | undefined;
        events.push({
          providerEventId: `${id}:${status}:${String(statusEvent.timestamp ?? "")}`,
          providerMessageId: id,
          eventType: "message_status",
          status: normalizeStatus(status),
          errorMessage: firstError?.title ? String(firstError.title) : undefined,
        });
      }
    }
  }

  return events;
}

export function normalizeStatus(value: string) {
  const status = value.toLowerCase();
  if (status === "sent") return "Sent";
  if (status === "delivered") return "Delivered";
  if (status === "read") return "Read";
  if (status === "failed") return "Failed";
  return "Submitted";
}

export function maskProviderError(value: string) {
  return value
    .replace(/EA[A-Za-z0-9]{20,}/g, "EA***")
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"***"')
    .slice(0, 500);
}
