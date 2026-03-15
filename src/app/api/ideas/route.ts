import { NextResponse } from "next/server";
import { listIdeas, getIdeasStats } from "@/lib/ideas/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status") || undefined;
    const subreddit = searchParams.get("subreddit") || undefined;
    const minScore = searchParams.get("minScore") ? Number(searchParams.get("minScore")) : undefined;
    const maxScore = searchParams.get("maxScore") ? Number(searchParams.get("maxScore")) : undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50;
    const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : 0;
    const orderBy = (searchParams.get("orderBy") || "createdAt") as "createdAt" | "upvotes" | "compositeScore" | "commentCount";
    const orderDir = (searchParams.get("orderDir") || "desc") as "asc" | "desc";

    // If stats=true, return stats instead
    if (searchParams.get("stats") === "true") {
      const stats = await getIdeasStats();
      return NextResponse.json(stats);
    }

    const { ideas, total, limit: resLimit, offset: resOffset } = await listIdeas({
      status: status as "discovered" | "scored" | "generating" | "completed" | "failed" | undefined,
      subreddit: subreddit || undefined,
      minScore,
      maxScore,
      limit,
      offset,
      orderBy,
      orderDir,
    });

    return NextResponse.json({
      ideas,
      pagination: {
        total,
        limit: resLimit,
        offset: resOffset,
        hasMore: resOffset + ideas.length < total,
      },
    });
  } catch (error) {
    console.error("Error listing ideas:", error);
    return NextResponse.json(
      { error: "Failed to list ideas", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
