import { config } from "dotenv";
import { Worker, type ConnectionOptions } from "bullmq";
import { getServerEnv } from "../lib/env/server-env";
import { prisma } from "../lib/prisma";
import {
  rerunCampaignIdeaPipeline,
  rerunCampaignScoutIntel,
  runBuilderOutreach,
} from "../lib/campaigns/service";
import { processResendWebhook } from "../lib/webhooks/resend";
import { recordSchedulerFallback } from "../lib/webhooks/scheduler";
import { processStripeWebhook } from "../lib/webhooks/stripe";
import { createActivityLogEntry, emitActivityLog } from "../lib/instrumentation/activity-log";
import {
  createAgentRunCompletion,
  createAgentRunFailure,
  createAgentRunStart,
  emitAgentRun,
  toAgentRunId,
} from "../lib/instrumentation/agent-run";
import { getJobId, hasExhaustedRetries, routeToDlq } from "./dlq";
import { MainQueueNames, type QueueName } from "./queue-names";
import { makeRedisConnectionOptions } from "./redis-connection";
import { closeQueueRegistry, createQueueRegistry, type QueueRegistry } from "./queues";
import { createQueueProcessor } from "./processors";

config();

const env = getServerEnv();

// Validate required webhook secrets at startup
const resendSecret = env.RESEND_WEBHOOK_SECRET ?? "";
const stripeSecret = env.STRIPE_WEBHOOK_SECRET ?? "";

if (!env.RESEND_WEBHOOK_SECRET) {
  console.warn("WARNING: RESEND_WEBHOOK_SECRET not set - Resend webhooks will fail");
}
if (!env.STRIPE_WEBHOOK_SECRET) {
  console.warn("WARNING: STRIPE_WEBHOOK_SECRET not set - Stripe webhooks will fail");
}

const processQueueJob = createQueueProcessor(
  {
    runIdeaPipeline: rerunCampaignIdeaPipeline,
    rerunCampaignScoutIntel,
    runBuilderOutreach,
    processResendWebhook,
    processStripeWebhook,
    recordSchedulerFallback: async ({ campaignId, leadId, reason }) => {
      await prisma.$transaction(async (tx) => {
        await recordSchedulerFallback({
          tx,
          campaignId,
          leadId,
          reason,
        });
      });
    },
  },
  {
    resendWebhookSecret: resendSecret,
    stripeWebhookSecret: stripeSecret,
  }
);

function createWorker(
  queueName: QueueName,
  connection: ConnectionOptions,
  queueRegistry: QueueRegistry
): Worker<unknown> {
  const startedAtByRunId = new Map<string, number>();

  const worker = new Worker<unknown>(
    queueName,
    async (job) => processQueueJob(queueName, job),
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("active", (job) => {
    const runId = toAgentRunId(queueName, job);
    const maxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
    startedAtByRunId.set(runId, Date.now());

    emitAgentRun(createAgentRunStart(queueName, job));
    emitActivityLog(
      createActivityLogEntry({
        event: "job.active",
        level: "info",
        queue: queueName,
        jobId: getJobId(job),
        correlationId: runId,
        data: {
          attempt: job.attemptsMade + 1,
          maxAttempts,
        },
      })
    );
  });

  worker.on("completed", (job) => {
    const runId = toAgentRunId(queueName, job);
    const startedAtMs = startedAtByRunId.get(runId);
    startedAtByRunId.delete(runId);

    emitAgentRun(createAgentRunCompletion(queueName, job, startedAtMs));
    emitActivityLog(
      createActivityLogEntry({
        event: "job.completed",
        level: "info",
        queue: queueName,
        jobId: getJobId(job),
        correlationId: runId,
      })
    );
  });

  worker.on("failed", (job, error) => {
    if (!job) {
      emitActivityLog(
        createActivityLogEntry({
          event: "job.failed.unbound",
          level: "error",
          queue: queueName,
          jobId: "unknown",
          correlationId: `${queueName}:unknown`,
          data: {
            error: error.message,
          },
        })
      );
      return;
    }

    const runId = toAgentRunId(queueName, job);
    const startedAtMs = startedAtByRunId.get(runId);
    startedAtByRunId.delete(runId);

    emitAgentRun(createAgentRunFailure(queueName, job, error, startedAtMs));

    const retriesExhausted = hasExhaustedRetries(job);
    emitActivityLog(
      createActivityLogEntry({
        event: "job.failed",
        level: "error",
        queue: queueName,
        jobId: getJobId(job),
        correlationId: runId,
        data: {
          retriesExhausted,
          error: error.message,
        },
      })
    );

    if (!retriesExhausted) {
      return;
    }

    void routeToDlq({
      queueName,
      job,
      error,
      dlqQueues: queueRegistry.dlq,
    })
      .then(({ dlqQueueName, dlqJobId }) => {
        emitActivityLog(
          createActivityLogEntry({
            event: "job.routed_to_dlq",
            level: "warn",
            queue: queueName,
            jobId: getJobId(job),
            correlationId: runId,
            data: {
              dlqQueueName,
              dlqJobId,
            },
          })
        );
      })
      .catch((dlqError) => {
        emitActivityLog(
          createActivityLogEntry({
            event: "job.dlq_route_failed",
            level: "error",
            queue: queueName,
            jobId: getJobId(job),
            correlationId: runId,
            data: {
              error: dlqError instanceof Error ? dlqError.message : String(dlqError),
            },
          })
        );
      });
  });

  worker.on("error", (error) => {
    emitActivityLog(
      createActivityLogEntry({
        event: "worker.error",
        level: "error",
        queue: queueName,
        jobId: "worker",
        correlationId: `${queueName}:worker`,
        data: {
          error: error.message,
        },
      })
    );
  });

  return worker;
}

async function boot(): Promise<void> {
  const connection: ConnectionOptions = makeRedisConnectionOptions(env.REDIS_URL);
  const queueRegistry = createQueueRegistry(connection);

  const workers = MainQueueNames.map((queueName) => createWorker(queueName, connection, queueRegistry));

  console.info(
    `Worker runtime started with ${workers.length} workers and ${Object.keys(queueRegistry.dlq).length} DLQ queues.`
  );

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.info(`Received ${signal}, shutting down workers...`);

    await Promise.all(workers.map((worker) => worker.close()));
    await closeQueueRegistry(queueRegistry);

    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

boot().catch((error) => {
  console.error("Worker bootstrap failed", error);
  process.exit(1);
});
