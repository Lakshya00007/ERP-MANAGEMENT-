import "server-only";

import crypto from "node:crypto";
import type { CommunicationChannel } from "@/lib/communications/types";

export async function sendMockMessage(channel: CommunicationChannel, seed: string) {
  const digest = crypto.createHash("sha256").update(`${channel}:${seed}`).digest("hex").slice(0, 16);
  return {
    providerMessageId: `mock_${channel.toLowerCase()}_${digest}`,
    providerResponseCode: "MOCK",
    rawStatus: "Submitted",
  };
}

export async function testMockConnection() {
  return { ok: true, mode: "mock" };
}
