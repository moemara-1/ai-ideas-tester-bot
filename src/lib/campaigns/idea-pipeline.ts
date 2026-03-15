import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Campaign } from "@prisma/client";
import { prisma } from "../prisma";
import { clamp, normalizeBusinessName, normalizeDomain, slugify } from "./normalization";
import type { IdeaSignalInput } from "./schemas";

const SIGNAL_KEYWORDS = [
  "ai",
  "agent",
  "automation",
  "workflow",
  "template",
  "community",
  "viral",
  "creator",
  "reddit",
  "youtube",
  "shorts",
  "distribution",
] as const;

const IDEA_TEMPLATES = [
  "Operators share painful {vertical} bottlenecks in {region} forums",
  "High-engagement threads ask for reusable {vertical} playbooks",
  "Creators seek lightweight tooling around {vertical} outcomes",
  "Weekly posts compare no-code stacks for {vertical} workflows",
  "Teams request AI copilots to remove repetitive {vertical} tasks",
] as const;

const IDEA_SOURCES = ["reddit", "x", "youtube", "producthunt", "indiehackers"] as const;

const ARTIFACT_ROOT = path.resolve(process.cwd(), "artifacts", "intelligence");

type CampaignForIdea = Pick<
  Campaign,
  "id" | "slug" | "name" | "targetRegion" | "targetVertical" | "targetingConfig" | "startedAt"
>;

type IdeaSourceSignal = {
  title: string;
  source: string;
  url: string | null;
  summary: string;
  engagementCount: number;
  noveltyHint: string | null;
};

type ScoredSignal = {
  leadId: string;
  businessId: string;
  title: string;
  source: string;
  summary: string;
  score: number;
  viralityScore: number;
  noveltyScore: number;
  executionEaseScore: number;
};

export type IdeaPipelineRunSummary = {
  mode: "idea_intelligence";
  businessesRequested: number;
  businessesCreated: number;
  businessesUpdated: number;
  leadsCreated: number;
  leadsUpdated: number;
  leadsScored: number;
  sourceItemsRequested: number;
  sourceItemsIngested: number;
  signalsCreated: number;
  signalsUpdated: number;
  experimentsGenerated: number;
  reportArtifactPath: string;
  reportId: string;
  experimentArtifacts: string[];
  topSignals: Array<{
    leadId: string;
    businessId: string;
    title: string;
    source: string;
    score: number;
    artifactPaths: string[];
  }>;
};

export type RunIdeaPipelineParams = {
  campaignId: string;
  maxSourceSignals: number;
  experimentsPerSignal: number;
  seedSignals?: IdeaSignalInput[];
};

function serializeJson(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return JSON.stringify(value);
}

function safeRelativePath(absolutePath: string): string {
  return path.relative(process.cwd(), absolutePath).split(path.sep).join("/");
}

function coerceSummary(input: Pick<IdeaSourceSignal, "title" | "summary">): string {
  return input.summary.trim().length > 0
    ? input.summary.trim()
    : `${input.title} showed traction and recurring pain points across operator communities.`;
}

function deterministicIndex(seed: string, mod: number): number {
  const hash = createHash("sha1").update(seed).digest("hex");
  const prefix = Number.parseInt(hash.slice(0, 8), 16);
  return prefix % mod;
}

function buildGeneratedSignals(campaign: CampaignForIdea, maxSourceSignals: number): IdeaSourceSignal[] {
  const vertical = campaign.targetVertical?.trim() || "AI workflow";
  const region = campaign.targetRegion?.trim() || "global teams";

  return Array.from({ length: maxSourceSignals }, (_, index) => {
    const templateIndex = deterministicIndex(`${campaign.id}:template:${index}`, IDEA_TEMPLATES.length);
    const sourceIndex = deterministicIndex(`${campaign.id}:source:${index}`, IDEA_SOURCES.length);
    const rawTemplate = IDEA_TEMPLATES[templateIndex] as string;
    const source = IDEA_SOURCES[sourceIndex] as string;
    const title = rawTemplate.replaceAll("{vertical}", vertical).replaceAll("{region}", region);
    const slug = slugify(title) || `signal-${index + 1}`;
    const url = `https://${source}.example.com/${slug}-${index + 1}`;
    const engagementSeed = deterministicIndex(`${campaign.id}:engagement:${index}`, 1_200);

    return {
      title,
      source,
      url,
      summary: `${title}. Discussion clusters around rapid validation, distribution loops, and short feedback cycles.`,
      engagementCount: 150 + engagementSeed,
      noveltyHint: "deterministic_generated_signal",
    };
  });
}

function resolveSourceSignals(params: {
  campaign: CampaignForIdea;
  maxSourceSignals: number;
  seedSignals?: IdeaSignalInput[];
}): IdeaSourceSignal[] {
  if (params.seedSignals && params.seedSignals.length > 0) {
    return params.seedSignals.slice(0, params.maxSourceSignals).map((signal) => ({
      title: signal.title.trim(),
      source: signal.source?.trim().toLowerCase() || "manual_seed",
      url: signal.url?.trim() || null,
      summary: signal.summary?.trim() || signal.noveltyHint?.trim() || signal.title.trim(),
      engagementCount: signal.engagementCount ?? 0,
      noveltyHint: signal.noveltyHint?.trim() || null,
    }));
  }

  return buildGeneratedSignals(params.campaign, params.maxSourceSignals);
}

function scoreSignal(input: IdeaSourceSignal): {
  score: number;
  viralityScore: number;
  noveltyScore: number;
  executionEaseScore: number;
} {
  const haystack = `${input.title} ${input.summary}`.toLowerCase();
  const keywordHits = SIGNAL_KEYWORDS.reduce(
    (count, keyword) => count + (haystack.includes(keyword) ? 1 : 0),
    0
  );

  const engagementScore = clamp(Math.round(Math.log10(input.engagementCount + 1) * 32), 0, 100);
  const keywordScore = clamp(keywordHits * 8, 0, 100);
  const noveltyHintBoost = input.noveltyHint ? 12 : 0;
  const summarySpecificityBoost = clamp(Math.round(input.summary.length / 12), 0, 18);

  const viralityScore = clamp(Math.round(engagementScore * 0.7 + keywordScore * 0.3), 0, 100);
  const noveltyScore = clamp(38 + keywordScore + noveltyHintBoost + summarySpecificityBoost, 0, 100);
  const executionEaseScore = clamp(50 + (input.url ? 12 : -8) + Math.min(keywordHits * 2, 14), 0, 100);
  const score = clamp(
    Math.round(viralityScore * 0.5 + noveltyScore * 0.35 + executionEaseScore * 0.15),
    0,
    100
  );

  return {
    score,
    viralityScore,
    noveltyScore,
    executionEaseScore,
  };
}

function buildLeadIdempotencyKey(campaignId: string, businessId: string): string {
  return `lead:${campaignId}:${businessId}`;
}

function buildBusinessIdempotencyKey(campaignId: string, externalSourceId: string): string {
  return `signal-business:${campaignId}:${externalSourceId.toLowerCase()}`;
}

function buildSourceExternalId(campaignId: string, source: string, title: string, url: string | null): string {
  const fingerprint = createHash("sha1")
    .update(`${campaignId}:${source}:${title}:${url ?? "no-url"}`)
    .digest("hex")
    .slice(0, 16);
  const sourceSlug = slugify(source) || "source";

  return `${sourceSlug}:${fingerprint}`;
}

function buildQualificationNotes(params: {
  score: number;
  source: string;
  viralityScore: number;
  noveltyScore: number;
  executionEaseScore: number;
}): string {
  const confidence = params.score >= 75 ? "high" : params.score >= 55 ? "medium" : "low";

  return [
    `Signal confidence: ${confidence}.`,
    `Source: ${params.source}.`,
    `Virality=${params.viralityScore}, Novelty=${params.noveltyScore}, ExecutionEase=${params.executionEaseScore}.`,
    "Prioritize experiments that can ship in <48h and produce measurable audience pull.",
  ].join(" ");
}

function buildExperimentMarkdown(params: {
  campaign: CampaignForIdea;
  signal: ScoredSignal;
  experimentIndex: number;
}): string {
  const hypothesis = `If we package "${params.signal.title}" into a narrow, repeatable deliverable, we can generate qualified inbound demand with low CAC.`;
  const experimentName = `Experiment ${params.experimentIndex + 1}: ${params.signal.source} demand validation`;

  return [
    `# ${experimentName}`,
    "",
    "## Context",
    `- Campaign: ${params.campaign.name}`,
    `- Signal title: ${params.signal.title}`,
    `- Source: ${params.signal.source}`,
    `- Score: ${params.signal.score} (virality ${params.signal.viralityScore}, novelty ${params.signal.noveltyScore}, execution ease ${params.signal.executionEaseScore})`,
    "",
    "## Hypothesis",
    hypothesis,
    "",
    "## Execution Plan",
    "1. Publish one concise value proposition variant anchored to the signal wording.",
    "2. Ship one lightweight proof artifact (thread, mini-tool, teardown, or prompt pack).",
    "3. Route interactions into a simple intent form and tag responses by pain pattern.",
    "",
    "## Success Criteria",
    "- >= 3 explicit problem confirmations within 48 hours",
    "- >= 1 conversion-ready conversation tied to the artifact",
    "- clear disqualifier list for next iteration",
    "",
    "## Immediate Follow-up",
    "- Retain winning framing language in the next report cycle",
    "- Archive losing framing with failure reason",
    "",
  ].join("\n");
}

async function writeExperimentArtifact(params: {
  campaign: CampaignForIdea;
  signal: ScoredSignal;
  experimentIndex: number;
}): Promise<string> {
  const folder = path.join(ARTIFACT_ROOT, "experiments", params.campaign.slug || params.campaign.id);
  await mkdir(folder, { recursive: true });

  const filePath = path.join(
    folder,
    `${params.signal.leadId}-exp-${String(params.experimentIndex + 1).padStart(2, "0")}.md`
  );
  const body = buildExperimentMarkdown(params);
  await writeFile(filePath, body, "utf8");

  return safeRelativePath(filePath);
}

async function writeReportArtifact(params: {
  campaign: CampaignForIdea;
  reportId: string;
  summary: IdeaPipelineRunSummary;
}): Promise<string> {
  const folder = path.join(ARTIFACT_ROOT, "reports", params.campaign.slug || params.campaign.id);
  await mkdir(folder, { recursive: true });

  const filePath = path.join(folder, `${params.reportId}.json`);
  await writeFile(
    filePath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        campaign: {
          id: params.campaign.id,
          slug: params.campaign.slug,
          name: params.campaign.name,
          targetVertical: params.campaign.targetVertical,
          targetRegion: params.campaign.targetRegion,
        },
        summary: {
          sourceItemsIngested: params.summary.sourceItemsIngested,
          signalsScored: params.summary.leadsScored,
          experimentsGenerated: params.summary.experimentsGenerated,
        },
        topSignals: params.summary.topSignals,
        artifacts: {
          experiments: params.summary.experimentArtifacts,
        },
      },
      null,
      2
    ),
    "utf8"
  );

  return safeRelativePath(filePath);
}

export async function runIdeaPipeline(params: RunIdeaPipelineParams): Promise<IdeaPipelineRunSummary> {
  const campaign = await prisma.campaign.findUnique({
    where: {
      id: params.campaignId,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      targetRegion: true,
      targetVertical: true,
      targetingConfig: true,
      startedAt: true,
    },
  });

  if (!campaign) {
    throw new Error(`Campaign ${params.campaignId} was not found.`);
  }

  const sourceSignals = resolveSourceSignals({
    campaign,
    maxSourceSignals: params.maxSourceSignals,
    seedSignals: params.seedSignals,
  });

  const summary: IdeaPipelineRunSummary = {
    mode: "idea_intelligence",
    businessesRequested: sourceSignals.length,
    businessesCreated: 0,
    businessesUpdated: 0,
    leadsCreated: 0,
    leadsUpdated: 0,
    leadsScored: 0,
    sourceItemsRequested: sourceSignals.length,
    sourceItemsIngested: 0,
    signalsCreated: 0,
    signalsUpdated: 0,
    experimentsGenerated: 0,
    reportArtifactPath: "",
    reportId: "",
    experimentArtifacts: [],
    topSignals: [],
  };

  const scoredSignalsByLead = new Map<string, ScoredSignal>();

  await prisma.$transaction(async (tx) => {
    for (const sourceSignal of sourceSignals) {
      const externalSourceId = buildSourceExternalId(
        campaign.id,
        sourceSignal.source,
        sourceSignal.title,
        sourceSignal.url
      );
      const businessIdempotencyKey = buildBusinessIdempotencyKey(campaign.id, externalSourceId);
      const normalizedDomain = normalizeDomain(sourceSignal.url);
      const normalizedName = normalizeBusinessName(sourceSignal.title);

      const existingBusiness = await tx.business.findUnique({
        where: {
          idempotencyKey: businessIdempotencyKey,
        },
        select: {
          id: true,
        },
      });

      const business = await tx.business.upsert({
        where: {
          idempotencyKey: businessIdempotencyKey,
        },
        update: {
          source: `signal_${slugify(sourceSignal.source) || "source"}`,
          externalSourceId,
          name: sourceSignal.title,
          normalizedName,
          websiteUrl: sourceSignal.url,
          normalizedDomain,
          metadata: serializeJson({
            sourceSignal,
          }),
        },
        create: {
          campaignId: campaign.id,
          source: `signal_${slugify(sourceSignal.source) || "source"}`,
          externalSourceId,
          name: sourceSignal.title,
          normalizedName,
          websiteUrl: sourceSignal.url,
          normalizedDomain,
          metadata: serializeJson({
            sourceSignal,
          }),
          idempotencyKey: businessIdempotencyKey,
        },
      });

      if (existingBusiness) {
        summary.businessesUpdated += 1;
      } else {
        summary.businessesCreated += 1;
      }

      const scoring = scoreSignal(sourceSignal);
      const qualificationNotes = buildQualificationNotes({
        score: scoring.score,
        source: sourceSignal.source,
        viralityScore: scoring.viralityScore,
        noveltyScore: scoring.noveltyScore,
        executionEaseScore: scoring.executionEaseScore,
      });
      const websiteSummary = coerceSummary({
        title: sourceSignal.title,
        summary: sourceSignal.summary,
      });

      const existingLead = await tx.lead.findUnique({
        where: {
          campaignId_businessId: {
            campaignId: campaign.id,
            businessId: business.id,
          },
        },
        select: {
          id: true,
        },
      });

      const lead = await tx.lead.upsert({
        where: {
          campaignId_businessId: {
            campaignId: campaign.id,
            businessId: business.id,
          },
        },
        update: {
          status: "signal_scored",
          score: scoring.score,
          firstName: null,
          lastName: null,
          fullName: sourceSignal.title.slice(0, 180),
          title: "Idea Signal",
          contactEmail: null,
          contactPhone: null,
          websiteSummary,
          qualificationNotes,
          metadata: serializeJson({
            source: sourceSignal.source,
            sourceUrl: sourceSignal.url,
            engagementCount: sourceSignal.engagementCount,
            noveltyHint: sourceSignal.noveltyHint,
            viralityScore: scoring.viralityScore,
            noveltyScore: scoring.noveltyScore,
            executionEaseScore: scoring.executionEaseScore,
          }),
        },
        create: {
          campaignId: campaign.id,
          businessId: business.id,
          status: "signal_scored",
          score: scoring.score,
          fullName: sourceSignal.title.slice(0, 180),
          title: "Idea Signal",
          websiteSummary,
          qualificationNotes,
          metadata: serializeJson({
            source: sourceSignal.source,
            sourceUrl: sourceSignal.url,
            engagementCount: sourceSignal.engagementCount,
            noveltyHint: sourceSignal.noveltyHint,
            viralityScore: scoring.viralityScore,
            noveltyScore: scoring.noveltyScore,
            executionEaseScore: scoring.executionEaseScore,
          }),
          idempotencyKey: buildLeadIdempotencyKey(campaign.id, business.id),
        },
      });

      if (existingLead) {
        summary.leadsUpdated += 1;
        summary.signalsUpdated += 1;
      } else {
        summary.leadsCreated += 1;
        summary.signalsCreated += 1;
      }
      summary.leadsScored += 1;
      summary.sourceItemsIngested += 1;

      scoredSignalsByLead.set(lead.id, {
        leadId: lead.id,
        businessId: business.id,
        title: sourceSignal.title,
        source: sourceSignal.source,
        summary: websiteSummary,
        score: scoring.score,
        viralityScore: scoring.viralityScore,
        noveltyScore: scoring.noveltyScore,
        executionEaseScore: scoring.executionEaseScore,
      });

      await tx.activityLog.upsert({
        where: {
          idempotencyKey: `activity:source.ingested:${campaign.id}:${business.id}`,
        },
        update: {
          campaignId: campaign.id,
          leadId: lead.id,
          entityType: "signal",
          entityId: business.id,
          event: "source.ingested",
          level: "info",
          queueName: "idea.pipeline",
          jobId: business.id,
          correlationId: `idea.pipeline:${campaign.id}`,
          message: "Source signal ingested into campaign intelligence graph.",
          payload: serializeJson({
            source: sourceSignal.source,
            title: sourceSignal.title,
            url: sourceSignal.url,
            engagementCount: sourceSignal.engagementCount,
          }),
        },
        create: {
          campaignId: campaign.id,
          leadId: lead.id,
          entityType: "signal",
          entityId: business.id,
          event: "source.ingested",
          level: "info",
          queueName: "idea.pipeline",
          jobId: business.id,
          correlationId: `idea.pipeline:${campaign.id}`,
          message: "Source signal ingested into campaign intelligence graph.",
          payload: serializeJson({
            source: sourceSignal.source,
            title: sourceSignal.title,
            url: sourceSignal.url,
            engagementCount: sourceSignal.engagementCount,
          }),
          idempotencyKey: `activity:source.ingested:${campaign.id}:${business.id}`,
        },
      });

      await tx.activityLog.upsert({
        where: {
          idempotencyKey: `activity:signal.scored:${campaign.id}:${lead.id}`,
        },
        update: {
          campaignId: campaign.id,
          leadId: lead.id,
          entityType: "signal",
          entityId: lead.id,
          event: "signal.scored",
          level: "info",
          queueName: "idea.pipeline",
          jobId: lead.id,
          correlationId: `idea.pipeline:${campaign.id}`,
          message: "Signal scored for experiment prioritization.",
          payload: serializeJson({
            score: scoring.score,
            viralityScore: scoring.viralityScore,
            noveltyScore: scoring.noveltyScore,
            executionEaseScore: scoring.executionEaseScore,
          }),
        },
        create: {
          campaignId: campaign.id,
          leadId: lead.id,
          entityType: "signal",
          entityId: lead.id,
          event: "signal.scored",
          level: "info",
          queueName: "idea.pipeline",
          jobId: lead.id,
          correlationId: `idea.pipeline:${campaign.id}`,
          message: "Signal scored for experiment prioritization.",
          payload: serializeJson({
            score: scoring.score,
            viralityScore: scoring.viralityScore,
            noveltyScore: scoring.noveltyScore,
            executionEaseScore: scoring.executionEaseScore,
          }),
          idempotencyKey: `activity:signal.scored:${campaign.id}:${lead.id}`,
        },
      });
    }

    await tx.campaign.update({
      where: {
        id: campaign.id,
      },
      data: {
        status: "active",
        startedAt: campaign.startedAt ?? new Date(),
      },
    });
  });

  const topSignals = Array.from(scoredSignalsByLead.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, params.maxSourceSignals);

  for (const signal of topSignals) {
    const signalArtifactPaths: string[] = [];

    for (let experimentIndex = 0; experimentIndex < params.experimentsPerSignal; experimentIndex += 1) {
      const artifactPath = await writeExperimentArtifact({
        campaign,
        signal,
        experimentIndex,
      });
      signalArtifactPaths.push(artifactPath);
      summary.experimentArtifacts.push(artifactPath);
      summary.experimentsGenerated += 1;

      await prisma.activityLog.upsert({
        where: {
          idempotencyKey: `activity:experiment.generated:${campaign.id}:${signal.leadId}:${
            experimentIndex + 1
          }`,
        },
        update: {
          campaignId: campaign.id,
          leadId: signal.leadId,
          entityType: "experiment",
          entityId: signal.leadId,
          event: "experiment.artifact.generated",
          level: "info",
          queueName: "idea.pipeline",
          jobId: signal.leadId,
          correlationId: `idea.pipeline:${campaign.id}`,
          message: "Experiment artifact generated from scored signal.",
          payload: serializeJson({
            artifactPath,
            experimentIndex: experimentIndex + 1,
          }),
        },
        create: {
          campaignId: campaign.id,
          leadId: signal.leadId,
          entityType: "experiment",
          entityId: signal.leadId,
          event: "experiment.artifact.generated",
          level: "info",
          queueName: "idea.pipeline",
          jobId: signal.leadId,
          correlationId: `idea.pipeline:${campaign.id}`,
          message: "Experiment artifact generated from scored signal.",
          payload: serializeJson({
            artifactPath,
            experimentIndex: experimentIndex + 1,
          }),
          idempotencyKey: `activity:experiment.generated:${campaign.id}:${signal.leadId}:${
            experimentIndex + 1
          }`,
        },
      });
    }

    await prisma.lead.update({
      where: {
        id: signal.leadId,
      },
      data: {
        status: "experiment_completed",
      },
    });

    summary.topSignals.push({
      leadId: signal.leadId,
      businessId: signal.businessId,
      title: signal.title,
      source: signal.source,
      score: signal.score,
      artifactPaths: signalArtifactPaths,
    });
  }

  const topSignalIds = summary.topSignals.map((signal) => signal.leadId);
  if (topSignalIds.length > 0) {
    await prisma.lead.updateMany({
      where: {
        id: {
          in: topSignalIds,
        },
      },
      data: {
        status: "report_published",
      },
    });
  }

  const reportId = createHash("sha1")
    .update(
      `${campaign.id}:${topSignalIds.join(",")}:${params.experimentsPerSignal}:${sourceSignals
        .map((signal) => signal.title)
        .join("|")}`
    )
    .digest("hex")
    .slice(0, 16);

  summary.reportId = reportId;
  summary.reportArtifactPath = await writeReportArtifact({
    campaign,
    reportId,
    summary,
  });

  await prisma.activityLog.upsert({
    where: {
      idempotencyKey: `activity:report.generated:${campaign.id}:${reportId}`,
    },
    update: {
      campaignId: campaign.id,
      entityType: "report",
      entityId: reportId,
      event: "report.generated",
      level: "info",
      queueName: "idea.pipeline",
      jobId: reportId,
      correlationId: `idea.pipeline:${campaign.id}`,
      message: "Pivot report generated from scored signals and experiment artifacts.",
      payload: serializeJson({
        reportArtifactPath: summary.reportArtifactPath,
        experimentsGenerated: summary.experimentsGenerated,
      }),
    },
    create: {
      campaignId: campaign.id,
      entityType: "report",
      entityId: reportId,
      event: "report.generated",
      level: "info",
      queueName: "idea.pipeline",
      jobId: reportId,
      correlationId: `idea.pipeline:${campaign.id}`,
      message: "Pivot report generated from scored signals and experiment artifacts.",
      payload: serializeJson({
        reportArtifactPath: summary.reportArtifactPath,
        experimentsGenerated: summary.experimentsGenerated,
      }),
      idempotencyKey: `activity:report.generated:${campaign.id}:${reportId}`,
    },
  });

  return summary;
}
