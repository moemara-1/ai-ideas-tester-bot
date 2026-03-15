import type { QueueName } from "../../workers/queue-names";

export type ActivityLevel = "info" | "warn" | "error";

export type ActivityLogEntry = {
  entity: "ActivityLog";
  event: string;
  level: ActivityLevel;
  queue: QueueName;
  jobId: string;
  correlationId: string;
  timestamp: string;
  data?: Record<string, unknown>;
};

export function createActivityLogEntry(params: {
  event: string;
  level: ActivityLevel;
  queue: QueueName;
  jobId: string;
  correlationId: string;
  data?: Record<string, unknown>;
}): ActivityLogEntry {
  return {
    entity: "ActivityLog",
    event: params.event,
    level: params.level,
    queue: params.queue,
    jobId: params.jobId,
    correlationId: params.correlationId,
    timestamp: new Date().toISOString(),
    ...(params.data ? { data: params.data } : {}),
  };
}

export function emitActivityLog(entry: ActivityLogEntry): void {
  const writer = entry.level === "error" ? console.error : console.info;
  writer(JSON.stringify(entry));
}
