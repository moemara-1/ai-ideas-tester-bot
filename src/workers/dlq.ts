import type { Job } from "bullmq";
import { toDlqQueueName, type DlqQueueName, type QueueName } from "./queue-names";

type QueueAdd = {
  add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown>;
};

type DlqJob = Pick<Job, "id" | "name" | "opts" | "attemptsMade" | "data">;

export type DlqPayload = {
  sourceQueue: QueueName;
  sourceJobId: string;
  sourceJobName: string;
  sourceAttemptsMade: number;
  sourceMaxAttempts: number;
  failedAt: string;
  errorMessage: string;
  errorStack?: string;
  sourceData: unknown;
  correlationId: string;
};

export function getJobId(job: Pick<Job, "id" | "name">): string {
  if (job.id === undefined || job.id === null) {
    return `anonymous:${job.name}`;
  }

  return String(job.id);
}

export function hasExhaustedRetries(job: Pick<Job, "attemptsMade" | "opts">): boolean {
  const maxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
  return job.attemptsMade >= maxAttempts;
}

export function buildDlqPayload(
  queueName: QueueName,
  job: DlqJob,
  error: Error,
  failedAt: string = new Date().toISOString()
): DlqPayload {
  const sourceJobId = getJobId(job);
  const sourceMaxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;

  return {
    sourceQueue: queueName,
    sourceJobId,
    sourceJobName: job.name,
    sourceAttemptsMade: job.attemptsMade,
    sourceMaxAttempts,
    failedAt,
    errorMessage: error.message,
    ...(error.stack ? { errorStack: error.stack } : {}),
    sourceData: job.data,
    correlationId: `${queueName}:${sourceJobId}`,
  };
}

export async function routeToDlq(params: {
  queueName: QueueName;
  job: DlqJob;
  error: Error;
  dlqQueues: Partial<Record<DlqQueueName, QueueAdd>>;
}): Promise<{ dlqQueueName: DlqQueueName; dlqJobId: string; payload: DlqPayload }> {
  const dlqQueueName = toDlqQueueName(params.queueName);
  const dlqQueue = params.dlqQueues[dlqQueueName];

  if (!dlqQueue) {
    throw new Error(`Missing DLQ queue: ${dlqQueueName}`);
  }

  const payload = buildDlqPayload(params.queueName, params.job, params.error);
  const dlqJobId = `${params.queueName}:${payload.sourceJobId}`;

  await dlqQueue.add("dead-letter", payload, { jobId: dlqJobId });

  return {
    dlqQueueName,
    dlqJobId,
    payload,
  };
}
