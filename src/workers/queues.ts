import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import {
  MainQueueNames,
  toDlqQueueName,
  type DlqQueueName,
  type QueueName,
} from "./queue-names";

export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: "exponential" as const,
    delay: 2_000,
  },
  removeOnComplete: 500,
  removeOnFail: 1_000,
} satisfies JobsOptions;

export const DEFAULT_DLQ_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: 1_000,
  removeOnFail: 1_000,
} satisfies JobsOptions;

export type QueueRegistry = {
  main: Record<QueueName, Queue>;
  dlq: Record<DlqQueueName, Queue>;
};

function makeQueue(
  name: QueueName | DlqQueueName,
  connection: ConnectionOptions,
  defaultJobOptions: JobsOptions
): Queue {
  return new Queue(name, {
    connection,
    defaultJobOptions,
  });
}

export function createQueueRegistry(connection: ConnectionOptions): QueueRegistry {
  const mainEntries = MainQueueNames.map((queueName) => [
    queueName,
    makeQueue(queueName, connection, DEFAULT_JOB_OPTIONS),
  ]);

  const dlqEntries = MainQueueNames.map((queueName) => {
    const dlqQueueName = toDlqQueueName(queueName);
    return [dlqQueueName, makeQueue(dlqQueueName, connection, DEFAULT_DLQ_JOB_OPTIONS)];
  });

  return {
    main: Object.fromEntries(mainEntries) as Record<QueueName, Queue>,
    dlq: Object.fromEntries(dlqEntries) as Record<DlqQueueName, Queue>,
  };
}

export async function closeQueueRegistry(registry: QueueRegistry): Promise<void> {
  await Promise.all([
    ...Object.values(registry.main).map((queue) => queue.close()),
    ...Object.values(registry.dlq).map((queue) => queue.close()),
  ]);
}
