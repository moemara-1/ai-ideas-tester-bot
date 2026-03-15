import { createHash } from "node:crypto";
import type { Campaign, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { isLeadLifecycleState, type LeadLifecycleState } from "../domain/states";
import { runIdeaPipeline, type IdeaPipelineRunSummary } from "./idea-pipeline";
import { slugify, toNullableTrimmed } from "./normalization";
import type {
  CreateCampaignRequest,
  ListCampaignsQuery,
  ListLeadsQuery,
  RunIdeaPipelineRequest,
  RunBuilderOutreachRequest,
  RunScoutIntelRequest,
} from "./schemas";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

type CampaignSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: Campaign["status"];
  targetRegion: string | null;
  targetVertical: string | null;
  createdAt: string;
  updatedAt: string;
  businessCount: number;
  leadCount: number;
};

export type ScoutIntelRunSummary = {
  businessesRequested: number;
  businessesCreated: number;
  businessesUpdated: number;
  leadsCreated: number;
  leadsUpdated: number;
  leadsScored: number;
};

export type BuilderOutreachRunSummary = {
  leadsConsidered: number;
  demoSitesDeployed: number;
  outreachSent: number;
  suppressedSkipped: number;
  missingEmailSkipped: number;
  invalidDemoUrlSkipped: number;
  alreadySentSkipped: number;
};

export type CreateCampaignResult = {
  created: boolean;
  pipelineMode: "idea_intelligence";
  campaign: CampaignSummary;
  pipeline: ScoutIntelRunSummary | IdeaPipelineRunSummary | null;
};

type LeadListItem = {
  id: string;
  campaignId: string;
  businessId: string;
  status: LeadLifecycleState;
  score: number | null;
  fullName: string | null;
  title: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteSummary: string | null;
  qualificationNotes: string | null;
  updatedAt: string;
  createdAt: string;
  campaign: {
    id: string;
    slug: string;
    name: string;
  };
  business: {
    id: string;
    name: string;
    websiteUrl: string | null;
    normalizedDomain: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
  };
};

type LeadDetails = LeadListItem & {
  demoSites: Array<{
    id: string;
    status: string;
    productionUrl: string | null;
    previewUrl: string | null;
    createdAt: string;
  }>;
  outreachMessages: Array<{
    id: string;
    status: string;
    toEmail: string;
    subject: string | null;
    sentAt: string | null;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    status: string;
    amountCents: number;
    currency: string;
    paymentUrl: string | null;
    createdAt: string;
  }>;
  timeline: Array<{
    id: string;
    event: string;
    level: string;
    message: string | null;
    occurredAt: string;
  }>;
};

const PAGES_HOST_SUFFIX = ".pages.dev";
const DEFAULT_OUTREACH_FROM = "hello@openclaw.example";

function serializeJson(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return JSON.stringify(value);
}

function mapCampaignSummary(
  campaign: Campaign & {
    _count: {
      businesses: number;
      leads: number;
    };
  }
): CampaignSummary {
  return {
    id: campaign.id,
    slug: campaign.slug,
    name: campaign.name,
    description: campaign.description,
    status: campaign.status,
    targetRegion: campaign.targetRegion,
    targetVertical: campaign.targetVertical,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
    businessCount: campaign._count.businesses,
    leadCount: campaign._count.leads,
  };
}

function toLeadListItem(
  lead: Prisma.LeadGetPayload<{
    include: {
      campaign: {
        select: {
          id: true;
          slug: true;
          name: true;
        };
      };
      business: {
        select: {
          id: true;
          name: true;
          websiteUrl: true;
          normalizedDomain: true;
          city: true;
          state: true;
          country: true;
        };
      };
    };
  }>
): LeadListItem {
  const status = isLeadLifecycleState(lead.status) ? lead.status : "discovered";

  return {
    id: lead.id,
    campaignId: lead.campaignId,
    businessId: lead.businessId,
    status,
    score: lead.score,
    fullName: lead.fullName,
    title: lead.title,
    contactEmail: lead.contactEmail,
    contactPhone: lead.contactPhone,
    websiteSummary: lead.websiteSummary,
    qualificationNotes: lead.qualificationNotes,
    updatedAt: lead.updatedAt.toISOString(),
    createdAt: lead.createdAt.toISOString(),
    campaign: lead.campaign,
    business: lead.business,
  };
}

function buildLeadIdempotencyKey(campaignId: string, businessId: string): string {
  return `lead:${campaignId}:${businessId}`;
}

function createDemoSlug(input: {
  campaignSlug: string;
  businessName: string;
  leadId: string;
}): string {
  const campaignPart = slugify(input.campaignSlug) || "campaign";
  const businessPart = slugify(input.businessName) || "lead";
  const hash = createHash("sha1")
    .update(`${input.campaignSlug}:${input.businessName}:${input.leadId}`)
    .digest("hex")
    .slice(0, 8);

  return `${campaignPart}-${businessPart}-${hash}`.slice(0, 63);
}

function assertValidDemoUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid demo URL format: ${rawUrl}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`Demo URL must use https: ${rawUrl}`);
  }

  if (!parsed.hostname.endsWith(PAGES_HOST_SUFFIX)) {
    throw new Error(`Demo URL host must end with ${PAGES_HOST_SUFFIX}: ${rawUrl}`);
  }

  return parsed.toString();
}

function buildUnsubscribeUrl(campaignId: string, leadId: string): string {
  const token = createHash("sha256").update(`${campaignId}:${leadId}`).digest("hex").slice(0, 16);
  return `https://unsubscribe.openclaw.local/u/${token}?leadId=${encodeURIComponent(leadId)}`;
}

function buildOutreachCopy(input: {
  campaignName: string;
  businessName: string;
  leadName: string;
  demoUrl: string;
  unsubscribeUrl: string;
}): { subject: string; bodyText: string; bodyHtml: string } {
  const subject = `Built a demo site for ${input.businessName}`;
  const bodyText = [
    `Hi ${input.leadName},`,
    "",
    `I put together a conversion-focused demo landing page for ${input.businessName}:`,
    input.demoUrl,
    "",
    "If this is useful, reply and I can help make it live in production.",
    `If you prefer no further outreach, unsubscribe here: ${input.unsubscribeUrl}`,
  ].join("\n");
  const bodyHtml = [
    `<p>Hi ${input.leadName},</p>`,
    `<p>I put together a conversion-focused demo landing page for <strong>${input.businessName}</strong>:</p>`,
    `<p><a href="${input.demoUrl}">${input.demoUrl}</a></p>`,
    "<p>If this is useful, reply and I can help make it live in production.</p>",
    `<p>If you prefer no further outreach, <a href="${input.unsubscribeUrl}">unsubscribe here</a>.</p>`,
  ].join("");

  return {
    subject,
    bodyText,
    bodyHtml,
  };
}

async function ensureCampaignSlug(name: string, idempotencyKey: string): Promise<string> {
  const baseSlug = slugify(name) || "campaign";
  const suffix = idempotencyKey.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "seed";

  const existingForBase = await prisma.campaign.findUnique({
    where: {
      slug: baseSlug,
    },
    select: {
      idempotencyKey: true,
    },
  });

  if (!existingForBase || existingForBase.idempotencyKey === idempotencyKey) {
    return baseSlug;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${baseSlug}-${suffix}${attempt === 0 ? "" : `-${attempt + 1}`}`.slice(0, 100);
    const existing = await prisma.campaign.findUnique({
      where: {
        slug: candidate,
      },
      select: {
        idempotencyKey: true,
      },
    });

    if (!existing || existing.idempotencyKey === idempotencyKey) {
      return candidate;
    }
  }

  throw new Error("Unable to allocate a unique campaign slug after 10 attempts.");
}





export async function createCampaign(input: CreateCampaignRequest): Promise<CreateCampaignResult> {
  const idempotencyKey = input.idempotencyKey.trim();
  const shouldRunPipeline = !!input.runIdeaPipeline;

  const existingCampaign = await prisma.campaign.findUnique({
    where: {
      idempotencyKey,
    },
    select: {
      id: true,
      slug: true,
    },
  });

  const slug = existingCampaign?.slug ?? (await ensureCampaignSlug(input.name, idempotencyKey));

  const campaign = await prisma.campaign.upsert({
    where: {
      idempotencyKey,
    },
    update: {
      slug,
      name: input.name.trim(),
      description: toNullableTrimmed(input.description),
      targetRegion: toNullableTrimmed(input.targetRegion),
      targetVertical: toNullableTrimmed(input.targetVertical),
      targetingConfig: serializeJson(input.targetingConfig),
      status: shouldRunPipeline ? "active" : "draft",
    },
    create: {
      slug,
      name: input.name.trim(),
      description: toNullableTrimmed(input.description),
      targetRegion: toNullableTrimmed(input.targetRegion),
      targetVertical: toNullableTrimmed(input.targetVertical),
      targetingConfig: serializeJson(input.targetingConfig),
      status: shouldRunPipeline ? "active" : "draft",
      idempotencyKey,
    },
    include: {
      _count: {
        select: {
          businesses: true,
          leads: true,
        },
      },
    },
  });

  const pipeline = shouldRunPipeline
    ? await runIdeaPipeline({
        campaignId: campaign.id,
        maxSourceSignals: input.maxSourceSignals,
        experimentsPerSignal: input.experimentsPerSignal,
        seedSignals: input.seedSignals,
      })
    : null;

  const refreshed = await prisma.campaign.findUnique({
    where: {
      id: campaign.id,
    },
    include: {
      _count: {
        select: {
          businesses: true,
          leads: true,
        },
      },
    },
  });

  if (!refreshed) {
    throw new NotFoundError(`Campaign ${campaign.id} was not found after creation.`);
  }

  return {
    created: !existingCampaign,
    pipelineMode: "idea_intelligence" as const,
    campaign: mapCampaignSummary(refreshed),
    pipeline,
  };
}



export async function listCampaigns(input: ListCampaignsQuery): Promise<CampaignSummary[]> {
  const campaigns = await prisma.campaign.findMany({
    where: input.status
      ? {
          status: input.status,
        }
      : undefined,
    include: {
      _count: {
        select: {
          businesses: true,
          leads: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: input.limit,
  });

  return campaigns.map(mapCampaignSummary);
}

export async function listLeads(input: ListLeadsQuery): Promise<LeadListItem[]> {
  const where: Prisma.LeadWhereInput = {
    ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(typeof input.minScore === "number" ? { score: { gte: input.minScore } } : {}),
  };

  const leads = await prisma.lead.findMany({
    where,
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
          id: true,
          name: true,
          websiteUrl: true,
          normalizedDomain: true,
          city: true,
          state: true,
          country: true,
        },
      },
    },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: input.limit,
  });

  return leads.map(toLeadListItem);
}

export async function getLeadById(leadId: string): Promise<LeadDetails> {
  const lead = await prisma.lead.findUnique({
    where: {
      id: leadId,
    },
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
          id: true,
          name: true,
          websiteUrl: true,
          normalizedDomain: true,
          city: true,
          state: true,
          country: true,
        },
      },
      demoSites: {
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
      },
      outreachMessages: {
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      },
      payments: {
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      },
      activityLogs: {
        orderBy: {
          occurredAt: "desc",
        },
        take: 50,
      },
    },
  });

  if (!lead) {
    throw new NotFoundError(`Lead ${leadId} was not found.`);
  }

  const base = toLeadListItem(lead);

  return {
    ...base,
    demoSites: lead.demoSites.map((site) => ({
      id: site.id,
      status: site.status,
      productionUrl: site.productionUrl,
      previewUrl: site.previewUrl,
      createdAt: site.createdAt.toISOString(),
    })),
    outreachMessages: lead.outreachMessages.map((message) => ({
      id: message.id,
      status: message.status,
      toEmail: message.toEmail,
      subject: message.subject,
      sentAt: message.sentAt ? message.sentAt.toISOString() : null,
      createdAt: message.createdAt.toISOString(),
    })),
    payments: lead.payments.map((payment) => ({
      id: payment.id,
      status: payment.status,
      amountCents: payment.amountCents,
      currency: payment.currency,
      paymentUrl: payment.paymentUrl,
      createdAt: payment.createdAt.toISOString(),
    })),
    timeline: lead.activityLogs.map((item) => ({
      id: item.id,
      event: item.event,
      level: item.level,
      message: item.message,
      occurredAt: item.occurredAt.toISOString(),
    })),
  };
}
