import { NextResponse } from "next/server";
import { getMetaWebhookVerifyToken } from "@/lib/env";
import { hashPayload } from "@/lib/communications/crypto";
import { applyProviderStatusUpdate } from "@/lib/communications/service";
import {
  parseWebhook,
  verifyWebhookSignature,
} from "@/lib/communications/providers/meta-whatsapp";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === getMetaWebhookVerifyToken() && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const events = parseWebhook(payload);
  const payloadHash = hashPayload(rawBody);

  for (const event of events) {
    await applyProviderStatusUpdate({
      provider: "MetaCloud",
      providerEventId: event.providerEventId,
      providerMessageId: event.providerMessageId,
      status: event.status,
      payloadHash: `${payloadHash}:${event.providerEventId}`,
      payloadJson: payload,
      errorMessage: event.errorMessage,
    });
  }

  return NextResponse.json({ received: true, events: events.length });
}
