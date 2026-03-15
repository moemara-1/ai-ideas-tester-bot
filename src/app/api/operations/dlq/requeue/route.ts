import { NextResponse } from "next/server";
import { requeueDlqJob } from "@/workers/dlq-admin";
import { MainQueueNames, type DlqQueueName } from "@/workers/queue-names";

export const runtime = "nodejs";

function isDlqQueueName(value: string): value is DlqQueueName {
  return MainQueueNames.some((queueName) => `dlq.${queueName}` === value);
}

export async function POST(request: Request): Promise<NextResponse> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return NextResponse.json(
      {
        error: "DLQ requeue is unavailable because REDIS_URL is not configured.",
      },
      {
        status: 503,
      }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        dlqQueueName?: string;
        dlqJobId?: string;
      }
    | null;

  if (!body?.dlqQueueName || !isDlqQueueName(body.dlqQueueName)) {
    return NextResponse.json(
      {
        error: "Invalid or missing dlqQueueName.",
      },
      {
        status: 400,
      }
    );
  }

  if (!body.dlqJobId || body.dlqJobId.trim().length === 0) {
    return NextResponse.json(
      {
        error: "Invalid or missing dlqJobId.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const result = await requeueDlqJob({
      redisUrl,
      dlqQueueName: body.dlqQueueName,
      dlqJobId: body.dlqJobId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown requeue failure";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 404,
      }
    );
  }
}
