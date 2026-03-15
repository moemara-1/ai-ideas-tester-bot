import type { Job } from "bullmq";
import type { QueueName } from "../../workers/queue-names";
import type { AgentRunState } from "../domain/states";

export type AgentRunStatus = AgentRunState;

type AgentRunJob = Pick<Job, "id" | "name" | "attemptsMade" | "opts">;

export type AgentRunLog = {
  entity: "AgentRun";
  runId: string;
  queue: QueueName;
  jobId: string;
  jobName: string;
  status: AgentRunStatus;
  attempt: number;
  maxAttempts: number;
  correlationId: string;
  timestamp: string;
  durationMs?: number;
  error?: string;
};

function normalizeJobId(job: Pick<Job, "id" | "name">): string {
  if (job.id === undefined || job.id === null) {
    return `anonymous:${job.name}`;
  }

  return String(job.id);
}

function getMaxAttempts(job: Pick<Job, "opts">): number {
  const attempts = job.opts.attempts;
  return typeof attempts === "number" && attempts > 0 ? attempts : 1;
}

export function toAgentRunId(queueName: QueueName, job: Pick<Job, "id" | "name">): string {
  return `${queueName}:${normalizeJobId(job)}`;
}

function createAgentRunLog(
  queueName: QueueName,
  job: AgentRunJob,
  status: AgentRunState,
  startedAtMs?: number,
  error?: Error
): AgentRunLog {
  const maxAttempts = getMaxAttempts(job);
  const attempt = Math.min(job.attemptsMade + 1, maxAttempts);
  const timestamp = new Date().toISOString();

  const log: AgentRunLog = {
    entity: "AgentRun",
    runId: toAgentRunId(queueName, job),
    queue: queueName,
    jobId: normalizeJobId(job),
    jobName: job.name,
    status,
    attempt,
    maxAttempts,
    correlationId: toAgentRunId(queueName, job),
    timestamp,
  };

  if (typeof startedAtMs === "number") {
    log.durationMs = Date.now() - startedAtMs;
  }

  if (error) {
    log.error = error.message;
  }

  return log;
}

export function createAgentRunStart(queueName: QueueName, job: AgentRunJob): AgentRunLog {
  return createAgentRunLog(queueName, job, "started");
}

export function createAgentRunCompletion(
  queueName: QueueName,
  job: AgentRunJob,
  startedAtMs?: number
): AgentRunLog {
  return createAgentRunLog(queueName, job, "completed", startedAtMs);
}

export function createAgentRunFailure(
  queueName: QueueName,
  job: AgentRunJob,
  error: Error,
  startedAtMs?: number
): AgentRunLog {
  return createAgentRunLog(queueName, job, "failed", startedAtMs, error);
}

export function emitAgentRun(log: AgentRunLog): void {
  const writer = log.status === "failed" ? console.error : console.info;
  writer(JSON.stringify(log));
}
