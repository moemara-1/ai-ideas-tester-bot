import { createHash } from "node:crypto";
import { z } from "zod";
import { IdeaSignalInputSchema, ScoutBusinessInputSchema } from "@/lib/campaigns/schemas";

const BaseControlSchema = z
  .object({
    forceFailure: z.boolean().optional(),
  })
  .strict();

export const ScoutIntelJobDataSchema = BaseControlSchema.extend({
  campaignId: z.string().trim().min(1),
  maxScoutBusinesses: z.number().int().min(1).max(100).optional().default(10),
  seedBusinesses: z.array(ScoutBusinessInputSchema).max(100).optional(),
});

export const IdeaPipelineJobDataSchema = BaseControlSchema.extend({
  campaignId: z.string().trim().min(1),
  maxSourceSignals: z.number().int().min(1).max(100).optional().default(8),
  experimentsPerSignal: z.number().int().min(1).max(5).optional().default(1),
  seedSignals: z.array(IdeaSignalInputSchema).max(100).optional(),
});

export const BuilderOutreachJobDataSchema = BaseControlSchema.extend({
  campaignId: z.string().trim().min(1),
  limit: z.number().int().min(1).max(500).optional().default(100),
});

export const CloserProviderSchema = z.enum(["resend", "stripe"]);

export const CloserJobDataSchema = BaseControlSchema.extend({
  provider: CloserProviderSchema,
  rawBody: z.string().min(1),
  signatureHeader: z.string().min(1).nullable().optional(),
});

export const SchedulerJobDataSchema = BaseControlSchema.extend({
  campaignId: z.string().trim().min(1),
  leadId: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional().default("calendar_not_configured"),
});

export type ScoutIntelJobData = z.infer<typeof ScoutIntelJobDataSchema>;
export type IdeaPipelineJobData = z.infer<typeof IdeaPipelineJobDataSchema>;
export type BuilderOutreachJobData = z.infer<typeof BuilderOutreachJobDataSchema>;
export type CloserJobData = z.infer<typeof CloserJobDataSchema>;
export type SchedulerJobData = z.infer<typeof SchedulerJobDataSchema>;

export function buildDeterministicJobId(prefix: string, payload: unknown): string {
  const payloadHash = createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 20);
  return `${prefix}:${payloadHash}`;
}
