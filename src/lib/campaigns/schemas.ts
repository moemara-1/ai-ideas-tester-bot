import { z } from "zod";

const OptionalString = z.string().trim().min(1).max(255).optional();
export const PipelineModeSchema = z.enum(["idea_intelligence"]);

export const ScoutBusinessInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    externalSourceId: OptionalString,
    websiteUrl: OptionalString,
    primaryEmail: OptionalString,
    phone: OptionalString,
    addressLine1: OptionalString,
    city: OptionalString,
    state: OptionalString,
    country: OptionalString,
    postalCode: OptionalString,
  })
  .strict();

export const IdeaSignalInputSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    source: z.string().trim().min(1).max(80).optional(),
    url: OptionalString,
    summary: z.string().trim().min(1).max(2_000).optional(),
    engagementCount: z.number().int().min(0).max(1_000_000).optional(),
    noveltyHint: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

const CampaignTargetingConfigSchema = z.record(z.string(), z.unknown());

export const CreateCampaignRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2_000).optional(),
    targetRegion: OptionalString,
    targetVertical: OptionalString,
    targetingConfig: CampaignTargetingConfigSchema.optional(),
    idempotencyKey: z.string().trim().min(4).max(120),
    pipelineMode: PipelineModeSchema.optional(),
    runIdeaPipeline: z.boolean().optional().default(true),
    maxSourceSignals: z.number().int().min(1).max(100).optional().default(8),
    experimentsPerSignal: z.number().int().min(1).max(5).optional().default(1),
    seedSignals: z.array(IdeaSignalInputSchema).max(100).optional(),
  })
  .strict();

export const RunScoutIntelRequestSchema = z
  .object({
    maxScoutBusinesses: z.number().int().min(1).max(100).optional().default(10),
    seedBusinesses: z.array(ScoutBusinessInputSchema).max(100).optional(),
  })
  .strict();

export const RunIdeaPipelineRequestSchema = z
  .object({
    maxSourceSignals: z.number().int().min(1).max(100).optional().default(8),
    experimentsPerSignal: z.number().int().min(1).max(5).optional().default(1),
    seedSignals: z.array(IdeaSignalInputSchema).max(100).optional(),
  })
  .strict();

export const RunBuilderOutreachRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(500).optional().default(100),
  })
  .strict();

export const ListCampaignsQuerySchema = z
  .object({
    status: z
      .enum(["draft", "active", "paused", "completed", "failed", "archived"])
      .optional(),
    limit: z.number().int().min(1).max(100).optional().default(25),
  })
  .strict();

export const ListLeadsQuerySchema = z
  .object({
    campaignId: z.string().trim().min(1).optional(),
    status: z
      .enum([
        "discovered",
        "source_ingested",
        "enriched",
        "signal_scored",
        "scored",
        "experiment_queued",
        "experiment_running",
        "experiment_completed",
        "report_published",
        "demo_generated",
        "outreach_queued",
        "outreach_sent",
        "replied",
        "qualified",
        "payment_pending",
        "payment_completed",
        "scheduled",
        "disqualified",
      ])
      .optional(),
    minScore: z.number().int().min(0).max(100).optional(),
    limit: z.number().int().min(1).max(200).optional().default(50),
  })
  .strict();

export type ScoutBusinessInput = z.infer<typeof ScoutBusinessInputSchema>;
export type IdeaSignalInput = z.infer<typeof IdeaSignalInputSchema>;
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequestSchema>;
export type RunScoutIntelRequest = z.infer<typeof RunScoutIntelRequestSchema>;
export type RunIdeaPipelineRequest = z.infer<typeof RunIdeaPipelineRequestSchema>;
export type RunBuilderOutreachRequest = z.infer<typeof RunBuilderOutreachRequestSchema>;
export type ListCampaignsQuery = z.infer<typeof ListCampaignsQuerySchema>;
export type ListLeadsQuery = z.infer<typeof ListLeadsQuerySchema>;
