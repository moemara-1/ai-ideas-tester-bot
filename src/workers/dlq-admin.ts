import { Queue } from "bullmq";
import type { DlqPayload } from "./dlq";
import {
  MainQueueNames,
  toDlqQueueName,
  type DlqQueueName,
  type QueueName,
} from "./queue-names";
import { makeRedisConnectionOptions } from "./redis-connection";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

export function normalizeLimit(limit?: number): number {
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function isQueueName(value: string): value is QueueName {
  return MainQueueNames.includes(value as QueueName);
}

export function queueNameFromDlqName(dlqQueueName: DlqQueueName): QueueName {
  const sourceQueueName = dlqQueueName.replace(/^dlq\./, "");

  if (!isQueueName(sourceQueueName)) {
    throw new Error(`Unsupported source queue from DLQ name: ${dlqQueueName}`);
  }

  return sourceQueueName;
}

function toIsoTimestampOrNow(epochMillis: number | undefined): string {
  return typeof epochMillis === "number" && Number.isFinite(epochMillis)
    ? new Date(epochMillis).toISOString()
    : new Date().toISOString();
}

export type DlqJobSummary = {
  dlqQueueName: DlqQueueName;
  dlqJobId: string;
  sourceQueue: QueueName;
  sourceJobId: string;
  sourceJobName: string;
  sourceAttemptsMade: number;
  sourceMaxAttempts: number;
  errorMessage: string;
  failedAt: string;
  createdAt: string;
  correlationId: string;
};

export type DlqListing = {
  generatedAt: string;
  jobs: DlqJobSummary[];
};

export async function listDlqJobs(params: {
  redisUrl: string;
  queueName?: QueueName;
  limit?: number;
}): Promise<DlqListing> {
  const limit = normalizeLimit(params.limit);
  const queueNames = params.queueName ? [params.queueName] : MainQueueNames;
  const connection = makeRedisConnectionOptions(params.redisUrl);

  const queuePairs = queueNames.map((queueName) => {
    const dlqQueueName = toDlqQueueName(queueName);
    return {
      queueName,
      dlqQueueName,
      queue: new Queue<DlqPayload>(dlqQueueName, { connection }),
    };
  });

  try {
    const jobsByQueue = await Promise.all(
      queuePairs.map(async ({ queueName, dlqQueueName, queue }) => {
        const jobs = await queue.getJobs(["waiting", "delayed", "failed"], 0, limit - 1, false);

        return jobs.map((job) => {
          const payload = (job.data ?? {}) as Partial<DlqPayload>;
          return {
            dlqQueueName,
            dlqJobId: String(job.id),
            sourceQueue: payload.sourceQueue && isQueueName(payload.sourceQueue)
              ? payload.sourceQueue
              : queueName,
            sourceJobId: payload.sourceJobId ?? String(job.id),
            sourceJobName: payload.sourceJobName ?? job.name,
            sourceAttemptsMade:
              typeof payload.sourceAttemptsMade === "number" ? payload.sourceAttemptsMade : 1,
            sourceMaxAttempts:
              typeof payload.sourceMaxAttempts === "number" ? payload.sourceMaxAttempts : 1,
            errorMessage: payload.errorMessage ?? "Unknown failure",
            failedAt: payload.failedAt ?? toIsoTimestampOrNow(job.timestamp),
            createdAt: toIsoTimestampOrNow(job.timestamp),
            correlationId: payload.correlationId ?? `${queueName}:${String(job.id)}`,
          };
        });
      })
    );

    const jobs = jobsByQueue
      .flat()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);

    return {
      generatedAt: new Date().toISOString(),
      jobs,
    };
  } finally {
    await Promise.all(queuePairs.map(({ queue }) => queue.close()));
  }
}

export type DlqRequeueResult = {
  dlqQueueName: DlqQueueName;
  dlqJobId: string;
  sourceQueue: QueueName;
  requeuedJobId: string;
};

export async function requeueDlqJob(params: {
  redisUrl: string;
  dlqQueueName: DlqQueueName;
  dlqJobId: string;
}): Promise<DlqRequeueResult> {
  const connection = makeRedisConnectionOptions(params.redisUrl);
  const sourceQueueName = queueNameFromDlqName(params.dlqQueueName);

  const dlqQueue = new Queue<DlqPayload>(params.dlqQueueName, { connection });
  const sourceQueueClient = new Queue(sourceQueueName, { connection });

  try {
    const dlqJob = await dlqQueue.getJob(params.dlqJobId);

    if (!dlqJob) {
      throw new Error(`DLQ job ${params.dlqJobId} was not found in ${params.dlqQueueName}.`);
    }

    const payload = (dlqJob.data ?? {}) as Partial<DlqPayload>;
    const sourceQueue = payload.sourceQueue && isQueueName(payload.sourceQueue)
      ? payload.sourceQueue
      : sourceQueueName;

    const sourceJobId = payload.sourceJobId ?? params.dlqJobId;
    const requeueJobId = `retry:${sourceJobId}:${Date.now()}`;

    await sourceQueueClient.add(
      payload.sourceJobName ?? "dead-letter.retry",
      payload.sourceData ?? {},
      {
        jobId: requeueJobId,
        attempts:
          typeof payload.sourceMaxAttempts === "number" && payload.sourceMaxAttempts > 0
            ? payload.sourceMaxAttempts
            : 1,
      }
    );

    await dlqJob.remove();

    return {
      dlqQueueName: params.dlqQueueName,
      dlqJobId: params.dlqJobId,
      sourceQueue,
      requeuedJobId: requeueJobId,
    };
  } finally {
    await Promise.all([sourceQueueClient.close(), dlqQueue.close()]);
  }
}
