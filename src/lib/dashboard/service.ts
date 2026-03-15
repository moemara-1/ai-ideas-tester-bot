import { prisma } from "@/lib/prisma";
import {
  isLeadLifecycleState,
  type LeadLifecycleState,
} from "@/lib/domain/states";
import { type PipelineStageSummary, buildPipelineStages, countPipelineTotal } from "./pipeline";
import { listDlqJobs, type DlqJobSummary } from "@/workers/dlq-admin";
import { readQueueBacklogSnapshot, type QueueBacklogSnapshot } from "@/workers/queue-health";

type CampaignCard = {
  id: string;
  slug: string;
  name: string;
  status: string;
  targetRegion: string | null;
  targetVertical: string | null;
  businessCount: number;
  leadCount: number;
  updatedAt: string;
};

type LeadCard = {
  id: string;
  status: LeadLifecycleState;
  score: number | null;
  fullName: string | null;
  contactEmail: string | null;
  campaignId: string;
  campaignName: string;
  campaignSlug: string;
  businessName: string;
  updatedAt: string;
};

type ActivityItem = {
  id: string;
  event: string;
  level: string;
  message: string | null;
  queueName: string | null;
  jobId: string | null;
  campaignId: string | null;
  leadId: string | null;
  occurredAt: string;
};

type AgentRunSummary = {
  status: string;
  count: number;
};

export type DashboardSnapshot = {
  generatedAt: string;
  campaigns: CampaignCard[];
  leads: LeadCard[];
  recentActivity: ActivityItem[];
  pipeline: {
    stages: PipelineStageSummary[];
    totalLeads: number;
  };
  agentRuns: AgentRunSummary[];
  queueHealth: {
    snapshots: QueueBacklogSnapshot[];
    recentDlqJobs: DlqJobSummary[];
    unavailableReason: string | null;
  };
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown queue health error";
}

async function readOptionalQueueHealth(redisUrl?: string): Promise<{
  snapshots: QueueBacklogSnapshot[];
  recentDlqJobs: DlqJobSummary[];
  unavailableReason: string | null;
}> {
  if (!redisUrl) {
    return {
      snapshots: [],
      recentDlqJobs: [],
      unavailableReason: "REDIS_URL is not configured.",
    };
  }

  try {
    const [snapshots, dlqListing] = await Promise.all([
      readQueueBacklogSnapshot(redisUrl),
      listDlqJobs({ redisUrl, limit: 20 }),
    ]);

    return {
      snapshots,
      recentDlqJobs: dlqListing.jobs,
      unavailableReason: null,
    };
  } catch (error) {
    return {
      snapshots: [],
      recentDlqJobs: [],
      unavailableReason: toErrorMessage(error),
    };
  }
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [campaigns, leads, activityLogs, leadGroups, agentRunGroups, queueHealth] =
    await Promise.all([
      prisma.campaign.findMany({
        take: 10,
        orderBy: {
          updatedAt: "desc",
        },
        include: {
          _count: {
            select: {
              businesses: true,
              leads: true,
            },
          },
        },
      }),
      prisma.lead.findMany({
        take: 30,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        include: {
          campaign: {
            select: {
              id: true,
              slug: true,
              name: true,
            },
          },
          business: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.activityLog.findMany({
        take: 50,
        orderBy: {
          occurredAt: "desc",
        },
        select: {
          id: true,
          event: true,
          level: true,
          message: true,
          queueName: true,
          jobId: true,
          campaignId: true,
          leadId: true,
          occurredAt: true,
        },
      }),
      prisma.lead.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),
      prisma.agentRun.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),
      readOptionalQueueHealth(process.env.REDIS_URL),
    ]);

  const pipelineCounts: Partial<Record<LeadLifecycleState, number>> = {};
  for (const group of leadGroups) {
    if (!isLeadLifecycleState(group.status)) {
      continue;
    }

    pipelineCounts[group.status] = group._count._all;
  }
  const stages = buildPipelineStages(pipelineCounts);

  return {
    generatedAt: new Date().toISOString(),
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      slug: campaign.slug,
      name: campaign.name,
      status: campaign.status,
      targetRegion: campaign.targetRegion,
      targetVertical: campaign.targetVertical,
      businessCount: campaign._count.businesses,
      leadCount: campaign._count.leads,
      updatedAt: campaign.updatedAt.toISOString(),
    })),
    leads: leads.map((lead) => ({
      id: lead.id,
      status: isLeadLifecycleState(lead.status) ? lead.status : "discovered",
      score: lead.score,
      fullName: lead.fullName,
      contactEmail: lead.contactEmail,
      campaignId: lead.campaign.id,
      campaignName: lead.campaign.name,
      campaignSlug: lead.campaign.slug,
      businessName: lead.business.name,
      updatedAt: lead.updatedAt.toISOString(),
    })),
    recentActivity: activityLogs.map((entry) => ({
      id: entry.id,
      event: entry.event,
      level: entry.level,
      message: entry.message,
      queueName: entry.queueName,
      jobId: entry.jobId,
      campaignId: entry.campaignId,
      leadId: entry.leadId,
      occurredAt: entry.occurredAt.toISOString(),
    })),
    pipeline: {
      stages,
      totalLeads: countPipelineTotal(stages),
    },
    agentRuns: agentRunGroups.map((group) => ({
      status: group.status,
      count: group._count._all,
    })),
    queueHealth,
  };
}
