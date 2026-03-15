import { NextResponse } from "next/server";
import type { ZodIssue } from "zod";
import { RunIdeaPipelineRequestSchema, RunScoutIntelRequestSchema } from "@/lib/campaigns/schemas";
import {
  NotFoundError,
  rerunCampaignIdeaPipeline,
  rerunCampaignScoutIntel,
} from "@/lib/campaigns/service";
import { enqueueIdeaPipelineRun, enqueueScoutIntelRun } from "@/workers/enqueue";

export const runtime = "nodejs";

function formatIssues(issues: ZodIssue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "body";
    return `${path}: ${issue.message}`;
  });
}

type RouteContext = {
  params: Promise<{
    campaignId: string;
  }>;
};

type PipelineMode = "idea_intelligence" | "legacy_outreach";

function isAsyncMode(request: Request): boolean {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode")?.toLowerCase();
  const asyncFlag = searchParams.get("async")?.toLowerCase();
  return mode === "async" || asyncFlag === "true" || asyncFlag === "1";
}

function resolvePipelineMode(request: Request): PipelineMode {
  const { searchParams } = new URL(request.url);
  const rawMode = (searchParams.get("pipelineMode") ?? searchParams.get("pipeline") ?? "").toLowerCase();

  if (rawMode === "legacy_outreach" || rawMode === "legacy" || rawMode === "scout_intel") {
    return "legacy_outreach";
  }

  return "idea_intelligence";
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { campaignId } = await context.params;
  const rawBody = await request.json().catch(() => ({}));
  const pipelineMode = resolvePipelineMode(request);

  try {
    if (pipelineMode === "legacy_outreach") {
      const parsedBody = RunScoutIntelRequestSchema.safeParse(rawBody);
      if (!parsedBody.success) {
        return NextResponse.json(
          {
            error: "Invalid scout/intel rerun payload.",
            details: formatIssues(parsedBody.error.issues),
          },
          {
            status: 400,
          }
        );
      }

      if (isAsyncMode(request)) {
        const queueResult = await enqueueScoutIntelRun({
          campaignId,
          maxScoutBusinesses: parsedBody.data.maxScoutBusinesses,
          seedBusinesses: parsedBody.data.seedBusinesses,
        });

        return NextResponse.json(
          {
            campaignId,
            pipelineMode,
            queued: true,
            queue: queueResult,
          },
          {
            status: 202,
          }
        );
      }

      const summary = await rerunCampaignScoutIntel(campaignId, parsedBody.data);

      return NextResponse.json({
        campaignId,
        pipelineMode,
        summary,
      });
    }

    const parsedBody = RunIdeaPipelineRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: "Invalid idea pipeline rerun payload.",
          details: formatIssues(parsedBody.error.issues),
        },
        {
          status: 400,
        }
      );
    }

    if (isAsyncMode(request)) {
      const queueResult = await enqueueIdeaPipelineRun({
        campaignId,
        maxSourceSignals: parsedBody.data.maxSourceSignals,
        experimentsPerSignal: parsedBody.data.experimentsPerSignal,
        seedSignals: parsedBody.data.seedSignals,
      });

      return NextResponse.json(
        {
          campaignId,
          pipelineMode,
          queued: true,
          queue: queueResult,
        },
        {
          status: 202,
        }
      );
    }

    const summary = await rerunCampaignIdeaPipeline(campaignId, parsedBody.data);

    return NextResponse.json({
      campaignId,
      pipelineMode,
      summary,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 404,
        }
      );
    }

    throw error;
  }
}
