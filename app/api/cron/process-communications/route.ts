import { NextResponse } from "next/server";
import { getCommunicationCronSecret } from "@/lib/env";
import { processQueuedJobs } from "@/lib/communications/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const expected = getCommunicationCronSecret();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Invalid communication cron secret" }, { status: 401 });
  }

  return NextResponse.json(await processQueuedJobs(undefined, 50));
}
