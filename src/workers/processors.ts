import type { Job } from "bullmq";
import type {
  RunBuilderOutreachRequest,
  RunIdeaPipelineRequest,
  RunScoutIntelRequest,
} from "@/lib/campaigns/schemas";
import { QueueNames, type QueueName } from "./queue-names";
import {
  BuilderOutreachJobDataSchema,
  CloserJobDataSchema,
  IdeaPipelineJobDataSchema,
  SchedulerJobDataSchema,
  ScoutIntelJobDataSchema,
} from "./job-payloads";

// Idea Intelligence worker imports
import { processIdeaDiscovery } from "./discovery.worker";
import { processIdeaScoring } from "./scoring.worker";
import { processIdeaGeneration } from "./generator.worker";
import { processIdeaExecution } from "./executor.worker";

export type SchedulerFallbackInput = {
  campaignId: string;
  leadId: string;
  reason: string;
};

export type QueueProcessorDependencies = {
  runIdeaPipeline: (
    campaignId: string,
    input: RunIdeaPipelineRequest
  ) => Promise<unknown>;
  rerunCampaignScoutIntel: (
    campaignId: string,
    input: RunScoutIntelRequest
  ) => Promise<unknown>;
  runBuilderOutreach: (
    campaignId: string,
    input: RunBuilderOutreachRequest
  ) => Promise<unknown>;
  processResendWebhook: (params: {
    rawBody: string;
    signatureHeader: string | null;
    secret: string;
  }) => Promise<unknown>;
  processStripeWebhook: (params: {
    rawBody: string;
    signatureHeader: string | null;
    secret: string;
  }) => Promise<unknown>;
  recordSchedulerFallback: (input: SchedulerFallbackInput) => Promise<void>;
};

export type QueueProcessorSecrets = {
  resendWebhookSecret: string;
  stripeWebhookSecret: string;
};

export function createQueueProcessor(
  deps: QueueProcessorDependencies,
  secrets: QueueProcessorSecrets
): (queueName: QueueName, job: Job<unknown>) => Promise<unknown> {
  return async (queueName, job) => {
    const data = (job.data ?? {}) as Record<string, unknown>;

    if (data.forceFailure === true) {
      throw new Error("Simulated worker failure requested by job data.");
    }

    if (queueName === QueueNames.IdeaPipeline) {
      const parsed = IdeaPipelineJobDataSchema.parse(data);

      return deps.runIdeaPipeline(parsed.campaignId, {
        maxSourceSignals: parsed.maxSourceSignals,
        experimentsPerSignal: parsed.experimentsPerSignal,
        seedSignals: parsed.seedSignals,
      });
    }

    if (queueName === QueueNames.CampaignScout || queueName === QueueNames.LeadIntel) {
      const parsed = ScoutIntelJobDataSchema.parse(data);

      return deps.rerunCampaignScoutIntel(parsed.campaignId, {
        maxScoutBusinesses: parsed.maxScoutBusinesses,
        seedBusinesses: parsed.seedBusinesses,
      });
    }

    if (queueName === QueueNames.LeadBuilder || queueName === QueueNames.LeadOutreach) {
      const parsed = BuilderOutreachJobDataSchema.parse(data);

      return deps.runBuilderOutreach(parsed.campaignId, {
        limit: parsed.limit,
      });
    }

    if (queueName === QueueNames.LeadCloser) {
      const parsed = CloserJobDataSchema.parse(data);

      if (parsed.provider === "resend") {
        return deps.processResendWebhook({
          rawBody: parsed.rawBody,
          signatureHeader: parsed.signatureHeader ?? null,
          secret: secrets.resendWebhookSecret,
        });
      }

      return deps.processStripeWebhook({
        rawBody: parsed.rawBody,
        signatureHeader: parsed.signatureHeader ?? null,
        secret: secrets.stripeWebhookSecret,
      });
    }

    if (queueName === QueueNames.LeadScheduler) {
      const parsed = SchedulerJobDataSchema.parse(data);

      await deps.recordSchedulerFallback({
        campaignId: parsed.campaignId,
        leadId: parsed.leadId,
        reason: parsed.reason,
      });

      return {
        scheduled: false,
        reason: parsed.reason,
      };
    }

    // Idea Intelligence queue handlers
    if (queueName === QueueNames.IdeaDiscovery) {
      return processIdeaDiscovery({
        subreddits: data.subreddits as string[] | undefined,
        postsPerSubreddit: data.postsPerSubreddit as number | undefined,
        minUpvotes: data.minUpvotes as number | undefined,
      });
    }

    if (queueName === QueueNames.IdeaScoring) {
      return processIdeaScoring({
        ideaId: data.ideaId as string | undefined,
        limit: data.limit as number | undefined,
      });
    }

    if (queueName === QueueNames.IdeaGeneration) {
      return processIdeaGeneration({
        ideaId: data.ideaId as string,
        projectType: data.projectType as "agent" | "api" | "script" | "webapp" | undefined,
      });
    }

    if (queueName === QueueNames.IdeaExecution) {
      return processIdeaExecution({
        experimentId: data.experimentId as string,
      });
    }

    throw new Error(`Unsupported queue processor for queue: ${queueName}`);
  };
}
