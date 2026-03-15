import { NextResponse } from "next/server";
import type { ZodIssue } from "zod";
import { CreateCampaignRequestSchema, ListCampaignsQuerySchema } from "@/lib/campaigns/schemas";
import { createCampaign, listCampaigns } from "@/lib/campaigns/service";

export const runtime = "nodejs";

function formatIssues(issues: ZodIssue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "body";
    return `${path}: ${issue.message}`;
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const parsedQuery = ListCampaignsQuerySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        error: "Invalid campaign query parameters.",
        details: formatIssues(parsedQuery.error.issues),
      },
      {
        status: 400,
      }
    );
  }

  const campaigns = await listCampaigns(parsedQuery.data);

  return NextResponse.json({
    campaigns,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.json().catch(() => null);

  const parsedBody = CreateCampaignRequestSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Invalid campaign payload.",
        details: formatIssues(parsedBody.error.issues),
      },
      {
        status: 400,
      }
    );
  }

  const result = await createCampaign(parsedBody.data);

  return NextResponse.json(result, {
    status: result.created ? 201 : 200,
  });
}
