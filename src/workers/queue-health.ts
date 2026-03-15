import { Queue } from "bullmq";
import { MainQueueNames, toDlqQueueName, type QueueName } from "./queue-names";
import { makeRedisConnectionOptions } from "./redis-connection";

export type QueueBacklogSnapshot = {
  queueName: QueueName;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
  dlqWaiting: number;
  dlqDelayed: number;
  dlqFailed: number;
};

export async function readQueueBacklogSnapshot(redisUrl: string): Promise<QueueBacklogSnapshot[]> {
  const connection = makeRedisConnectionOptions(redisUrl);

  const mainQueues = MainQueueNames.map(
    (queueName) => new Queue(queueName, { connection })
  );

  const dlqQueues = MainQueueNames.map((queueName) => {
    const dlqQueueName = toDlqQueueName(queueName);
    return new Queue(dlqQueueName, { connection });
  });

  try {
    return Promise.all(
      MainQueueNames.map(async (queueName, index) => {
        const mainQueue = mainQueues[index];
        const dlqQueue = dlqQueues[index];

        const [mainCounts, dlqCounts] = await Promise.all([
          mainQueue.getJobCounts(
            "waiting",
            "active",
            "delayed",
            "completed",
            "failed",
            "paused"
          ),
          dlqQueue.getJobCounts("waiting", "delayed", "failed"),
        ]);

        return {
          queueName,
          waiting: mainCounts.waiting ?? 0,
          active: mainCounts.active ?? 0,
          delayed: mainCounts.delayed ?? 0,
          completed: mainCounts.completed ?? 0,
          failed: mainCounts.failed ?? 0,
          paused: mainCounts.paused ?? 0,
          dlqWaiting: dlqCounts.waiting ?? 0,
          dlqDelayed: dlqCounts.delayed ?? 0,
          dlqFailed: dlqCounts.failed ?? 0,
        };
      })
    );
  } finally {
    await Promise.all([
      ...mainQueues.map((queue) => queue.close()),
      ...dlqQueues.map((queue) => queue.close()),
    ]);
  }
}
