import { NextResponse } from "next/server";
import { listDlqJobs } from "@/workers/dlq-admin";
import { MainQueueNames, type QueueName } from "@/workers/queue-names";

export const runtime = "nodejs";

function isQueueName(value: string): value is QueueName {
  return MainQueueNames.includes(value as QueueName);
}

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

export async function GET(request: Request): Promise<NextResponse> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return NextResponse.json(
      {
        error: "DLQ is unavailable because REDIS_URL is not configured.",
      },
      {
        status: 503,
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const queueName = searchParams.get("queueName");

  if (queueName && !isQueueName(queueName)) {
    return NextResponse.json(
      {
        error: `Invalid queueName: ${queueName}`,
        allowed: MainQueueNames,
      },
      {
        status: 400,
      }
    );
  }

  const typedQueueName = queueName && isQueueName(queueName) ? queueName : undefined;

  const listing = await listDlqJobs({
    redisUrl,
    queueName: typedQueueName,
    limit: parseLimit(searchParams.get("limit")),
  });

  return NextResponse.json(listing);
}
