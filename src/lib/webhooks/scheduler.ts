import type { Prisma } from "@prisma/client";

export async function recordSchedulerFallback(params: {
  tx: Prisma.TransactionClient;
  campaignId: string;
  leadId: string;
  reason: string;
}): Promise<void> {
  await params.tx.activityLog.upsert({
    where: {
      idempotencyKey: `scheduler:fallback:${params.leadId}`,
    },
    update: {
      campaignId: params.campaignId,
      leadId: params.leadId,
      entityType: "lead",
      entityId: params.leadId,
      event: "lead.scheduler.deferred",
      level: "warn",
      queueName: "lead.scheduler",
      jobId: params.leadId,
      correlationId: `lead.scheduler:${params.leadId}`,
      message: "Scheduler integration unavailable; meeting handoff deferred.",
      payload: JSON.stringify({
        reason: params.reason,
      }),
    },
    create: {
      campaignId: params.campaignId,
      leadId: params.leadId,
      entityType: "lead",
      entityId: params.leadId,
      event: "lead.scheduler.deferred",
      level: "warn",
      queueName: "lead.scheduler",
      jobId: params.leadId,
      correlationId: `lead.scheduler:${params.leadId}`,
      message: "Scheduler integration unavailable; meeting handoff deferred.",
      payload: JSON.stringify({
        reason: params.reason,
      }),
      idempotencyKey: `scheduler:fallback:${params.leadId}`,
    },
  });
}
