import type { Queue } from "bullmq";
import { getServerEnv } from "@/lib/env/server-env";
import { makeRedisConnectionOptions } from "./redis-connection";
import { closeQueueRegistry, createQueueRegistry } from "./queues";
import { QueueNames, type QueueName } from "./queue-names";
import {
  BuilderOutreachJobDataSchema,
  IdeaPipelineJobDataSchema,
  ScoutIntelJobDataSchema,
  buildDeterministicJobId,
  type BuilderOutreachJobData,
  type IdeaPipelineJobData,
  type ScoutIntelJobData,
} from "./job-payloads";

type QueueJobResult = {
  queueName: QueueName;
  jobId: string;
  deduplicated: boolean;
};

function isDuplicateJobError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already\s+(?:exists|waiting|active|delayed|completed|failed)/i.test(message);
}

async function addIdempotentJob(params: {
  queue: Queue;
  queueName: QueueName;
  jobName: string;
  payload: Record<string, unknown>;
  jobIdPrefix: string;
}): Promise<QueueJobResult> {
  const jobId = buildDeterministicJobId(params.jobIdPrefix, params.payload);

  try {
    const job = await params.queue.add(params.jobName, params.payload, {
      jobId,
    });

    return {
      queueName: params.queueName,
      jobId: String(job.id ?? jobId),
      deduplicated: false,
    };
  } catch (error) {
    if (!isDuplicateJobError(error)) {
      throw error;
    }

    const existing = await params.queue.getJob(jobId);
    if (!existing) {
      throw error;
    }

    return {
      queueName: params.queueName,
      jobId,
      deduplicated: true,
    };
  }
}

async function withMainQueue<T>(
  queueName: QueueName,
  callback: (queue: Queue) => Promise<T>
): Promise<T> {
  const env = getServerEnv();
  const connection = makeRedisConnectionOptions(env.REDIS_URL);
  const registry = createQueueRegistry(connection);

  try {
    return await callback(registry.main[queueName]);
  } finally {
    await closeQueueRegistry(registry);
  }
}

export async function enqueueScoutIntelRun(input: {
  campaignId: string;
  maxScoutBusinesses?: number;
  seedBusinesses?: ScoutIntelJobData["seedBusinesses"];
}): Promise<QueueJobResult> {
  const payload = ScoutIntelJobDataSchema.parse({
    campaignId: input.campaignId,
    maxScoutBusinesses: input.maxScoutBusinesses,
    seedBusinesses: input.seedBusinesses,
  }) as ScoutIntelJobData;

  return withMainQueue(QueueNames.CampaignScout, (queue) =>
    addIdempotentJob({
      queue,
      queueName: QueueNames.CampaignScout,
      jobName: "campaign.scout.run",
      payload,
      jobIdPrefix: `campaign.scout:${payload.campaignId}`,
    })
  );
}

export async function enqueueIdeaPipelineRun(input: {
  campaignId: string;
  maxSourceSignals?: number;
  experimentsPerSignal?: number;
  seedSignals?: IdeaPipelineJobData["seedSignals"];
}): Promise<QueueJobResult> {
  const payload = IdeaPipelineJobDataSchema.parse({
    campaignId: input.campaignId,
    maxSourceSignals: input.maxSourceSignals,
    experimentsPerSignal: input.experimentsPerSignal,
    seedSignals: input.seedSignals,
  }) as IdeaPipelineJobData;

  return withMainQueue(QueueNames.IdeaPipeline, (queue) =>
    addIdempotentJob({
      queue,
      queueName: QueueNames.IdeaPipeline,
      jobName: "idea.pipeline.run",
      payload,
      jobIdPrefix: `idea.pipeline:${payload.campaignId}`,
    })
  );
}

export async function enqueueBuilderOutreachRun(input: {
  campaignId: string;
  limit?: number;
}): Promise<QueueJobResult> {
  const payload = BuilderOutreachJobDataSchema.parse({
    campaignId: input.campaignId,
    limit: input.limit,
  }) as BuilderOutreachJobData;

  return withMainQueue(QueueNames.LeadBuilder, (queue) =>
    addIdempotentJob({
      queue,
      queueName: QueueNames.LeadBuilder,
      jobName: "lead.builder.run",
      payload,
      jobIdPrefix: `lead.builder:${payload.campaignId}`,
    })
  );
}
