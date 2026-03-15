import { NextResponse } from "next/server";
import type { ZodIssue } from "zod";
import { ListLeadsQuerySchema } from "@/lib/campaigns/schemas";
import { listLeads } from "@/lib/campaigns/service";

export const runtime = "nodejs";

function formatIssues(issues: ZodIssue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "query";
    return `${path}: ${issue.message}`;
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const parsedQuery = ListLeadsQuerySchema.safeParse({
    campaignId: searchParams.get("campaignId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    minScore: searchParams.get("minScore") ? Number(searchParams.get("minScore")) : undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        error: "Invalid lead query parameters.",
        details: formatIssues(parsedQuery.error.issues),
      },
      {
        status: 400,
      }
    );
  }

  const leads = await listLeads(parsedQuery.data);

  return NextResponse.json({
    leads,
  });
}
