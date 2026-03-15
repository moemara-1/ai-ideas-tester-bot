import assert from "node:assert/strict";
import test from "node:test";
import type { Job } from "bullmq";
import { QueueNames, type QueueName } from "./queue-names";
import { createQueueProcessor } from "./processors";

function makeJob(queueName: QueueName, data: unknown): Job<unknown> {
  return {
    id: `${queueName}-job`,
    name: `${queueName}.run`,
    queueName,
    data,
    attemptsMade: 0,
    opts: {},
  } as Job<unknown>;
}

test("campaign.scout job delegates to rerunCampaignScoutIntel", async () => {
  const calls: Array<{ campaignId: string; maxScoutBusinesses?: number }> = [];

  const processor = createQueueProcessor(
    {
      runIdeaPipeline: async () => ({ ok: true }),
      rerunCampaignScoutIntel: async (campaignId, input) => {
        calls.push({ campaignId, maxScoutBusinesses: input.maxScoutBusinesses });
        return { ok: true };
      },
      runBuilderOutreach: async () => ({ ok: true }),
      processResendWebhook: async () => ({ ok: true }),
      processStripeWebhook: async () => ({ ok: true }),
      recordSchedulerFallback: async () => {},
    },
    {
      resendWebhookSecret: "resend-secret",
      stripeWebhookSecret: "stripe-secret",
    }
  );

  await processor(
    QueueNames.CampaignScout,
    makeJob(QueueNames.CampaignScout, {
      campaignId: "campaign-1",
      maxScoutBusinesses: 12,
    })
  );

  assert.deepEqual(calls, [{ campaignId: "campaign-1", maxScoutBusinesses: 12 }]);
});

test("idea.pipeline job delegates to runIdeaPipeline", async () => {
  const calls: Array<{ campaignId: string; maxSourceSignals?: number; experimentsPerSignal?: number }> =
    [];

  const processor = createQueueProcessor(
    {
      runIdeaPipeline: async (campaignId, input) => {
        calls.push({
          campaignId,
          maxSourceSignals: input.maxSourceSignals,
          experimentsPerSignal: input.experimentsPerSignal,
        });
        return { ok: true };
      },
      rerunCampaignScoutIntel: async () => ({ ok: true }),
      runBuilderOutreach: async () => ({ ok: true }),
      processResendWebhook: async () => ({ ok: true }),
      processStripeWebhook: async () => ({ ok: true }),
      recordSchedulerFallback: async () => {},
    },
    {
      resendWebhookSecret: "resend-secret",
      stripeWebhookSecret: "stripe-secret",
    }
  );

  await processor(
    QueueNames.IdeaPipeline,
    makeJob(QueueNames.IdeaPipeline, {
      campaignId: "campaign-idea-1",
      maxSourceSignals: 9,
      experimentsPerSignal: 2,
    })
  );

  assert.deepEqual(calls, [
    {
      campaignId: "campaign-idea-1",
      maxSourceSignals: 9,
      experimentsPerSignal: 2,
    },
  ]);
});

test("lead.builder job delegates to runBuilderOutreach", async () => {
  const calls: Array<{ campaignId: string; limit?: number }> = [];

  const processor = createQueueProcessor(
    {
      runIdeaPipeline: async () => ({ ok: true }),
      rerunCampaignScoutIntel: async () => ({ ok: true }),
      runBuilderOutreach: async (campaignId, input) => {
        calls.push({ campaignId, limit: input.limit });
        return { ok: true };
      },
      processResendWebhook: async () => ({ ok: true }),
      processStripeWebhook: async () => ({ ok: true }),
      recordSchedulerFallback: async () => {},
    },
    {
      resendWebhookSecret: "resend-secret",
      stripeWebhookSecret: "stripe-secret",
    }
  );

  await processor(
    QueueNames.LeadBuilder,
    makeJob(QueueNames.LeadBuilder, {
      campaignId: "campaign-2",
      limit: 55,
    })
  );

  assert.deepEqual(calls, [{ campaignId: "campaign-2", limit: 55 }]);
});

test("lead.closer routes resend and stripe payloads with configured secrets", async () => {
  const calls: Array<{ provider: string; secret: string; signatureHeader: string | null }> = [];

  const processor = createQueueProcessor(
    {
      runIdeaPipeline: async () => ({ ok: true }),
      rerunCampaignScoutIntel: async () => ({ ok: true }),
      runBuilderOutreach: async () => ({ ok: true }),
      processResendWebhook: async (params) => {
        calls.push({
          provider: "resend",
          secret: params.secret,
          signatureHeader: params.signatureHeader,
        });
        return { ok: true };
      },
      processStripeWebhook: async (params) => {
        calls.push({
          provider: "stripe",
          secret: params.secret,
          signatureHeader: params.signatureHeader,
        });
        return { ok: true };
      },
      recordSchedulerFallback: async () => {},
    },
    {
      resendWebhookSecret: "resend-secret",
      stripeWebhookSecret: "stripe-secret",
    }
  );

  await processor(
    QueueNames.LeadCloser,
    makeJob(QueueNames.LeadCloser, {
      provider: "resend",
      rawBody: '{"type":"email.replied"}',
      signatureHeader: "sig-resend",
    })
  );

  await processor(
    QueueNames.LeadCloser,
    makeJob(QueueNames.LeadCloser, {
      provider: "stripe",
      rawBody: '{"type":"checkout.session.completed"}',
      signatureHeader: "sig-stripe",
    })
  );

  assert.deepEqual(calls, [
    { provider: "resend", secret: "resend-secret", signatureHeader: "sig-resend" },
    { provider: "stripe", secret: "stripe-secret", signatureHeader: "sig-stripe" },
  ]);
});

test("lead.scheduler records deferred scheduling fallback", async () => {
  const calls: Array<{ campaignId: string; leadId: string; reason: string }> = [];

  const processor = createQueueProcessor(
    {
      runIdeaPipeline: async () => ({ ok: true }),
      rerunCampaignScoutIntel: async () => ({ ok: true }),
      runBuilderOutreach: async () => ({ ok: true }),
      processResendWebhook: async () => ({ ok: true }),
      processStripeWebhook: async () => ({ ok: true }),
      recordSchedulerFallback: async (input) => {
        calls.push(input);
      },
    },
    {
      resendWebhookSecret: "resend-secret",
      stripeWebhookSecret: "stripe-secret",
    }
  );

  const result = await processor(
    QueueNames.LeadScheduler,
    makeJob(QueueNames.LeadScheduler, {
      campaignId: "campaign-3",
      leadId: "lead-9",
      reason: "calendar_not_configured",
    })
  );

  assert.deepEqual(calls, [
    {
      campaignId: "campaign-3",
      leadId: "lead-9",
      reason: "calendar_not_configured",
    },
  ]);

  assert.deepEqual(result, {
    scheduled: false,
    reason: "calendar_not_configured",
  });
});

test("forceFailure flag raises deterministic failure for DLQ verification", async () => {
  const processor = createQueueProcessor(
    {
      runIdeaPipeline: async () => ({ ok: true }),
      rerunCampaignScoutIntel: async () => ({ ok: true }),
      runBuilderOutreach: async () => ({ ok: true }),
      processResendWebhook: async () => ({ ok: true }),
      processStripeWebhook: async () => ({ ok: true }),
      recordSchedulerFallback: async () => {},
    },
    {
      resendWebhookSecret: "resend-secret",
      stripeWebhookSecret: "stripe-secret",
    }
  );

  await assert.rejects(
    processor(
      QueueNames.CampaignScout,
      makeJob(QueueNames.CampaignScout, {
        campaignId: "campaign-4",
        forceFailure: true,
      })
    ),
    /Simulated worker failure requested by job data\./
  );
});
