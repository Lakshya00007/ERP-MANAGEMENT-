import "server-only";

type Msg91Config = {
  authKey?: string;
  senderId?: string;
  principalEntityId?: string;
  countryCode?: string;
};

type SendSmsInput = {
  to: string;
  flowId: string;
  senderId?: string | null;
  variables?: Record<string, unknown> | null;
};

export async function testConnection(config: Msg91Config) {
  if (!config.authKey) {
    throw new Error("MSG91 auth key is required");
  }

  return { ok: true };
}

export async function sendTemplateSms(config: Msg91Config, input: SendSmsInput) {
  if (!config.authKey) {
    throw new Error("MSG91 integration is missing auth key");
  }
  if (!input.flowId) {
    throw new Error("MSG91 Flow ID is required");
  }

  const payload = {
    template_id: input.flowId,
    sender: input.senderId || config.senderId,
    short_url: "0",
    mobiles: input.to.replace(/^\+/, ""),
    ...(input.variables ?? {}),
  };

  const response = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: {
      authkey: config.authKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(maskProviderError(JSON.stringify(body)));
  }

  return {
    providerMessageId:
      String(body.request_id ?? body.requestId ?? body.message_uuid ?? body.uuid ?? "") || null,
    providerResponseCode: String(response.status),
    rawStatus: parseProviderResponse(body),
  };
}

export function normalizeStatus(value: string) {
  const status = value.toLowerCase();
  if (status.includes("deliver")) return "Delivered";
  if (status.includes("sent")) return "Sent";
  if (status.includes("fail") || status.includes("reject")) return "Failed";
  return "Submitted";
}

export function parseProviderResponse(body: Record<string, unknown>) {
  return normalizeStatus(String(body.type ?? body.status ?? body.message ?? "submitted"));
}

export function maskProviderError(value: string) {
  return value
    .replace(/"authkey"\s*:\s*"[^"]+"/gi, '"authkey":"***"')
    .replace(/[a-f0-9]{24,}/gi, "***")
    .slice(0, 500);
}
