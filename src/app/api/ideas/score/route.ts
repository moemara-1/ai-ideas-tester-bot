import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import { makeRedisConnectionOptions } from "@/workers/redis-connection";
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let scoringQueue: Queue | null = null;
  
  try {
    // Apply rate limiting
    const rateLimitConfig = RATE_LIMITS.scoring;
    const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const isAllowed = checkRateLimit(`scoring:${clientIp}`, rateLimitConfig);
    
    if (!isAllowed) {
      const headers = getRateLimitHeaders(`scoring:${clientIp}`, rateLimitConfig);
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429, headers }
      );
    }
    
    const body = await request.json().catch(() => ({}));
    
    const ideaId = body.ideaId;
    const limit = body.limit || 10;

    // Create queue and add job
    const connection = makeRedisConnectionOptions(process.env.REDIS_URL || "redis://localhost:6379");
    scoringQueue = new Queue("idea.scoring", { connection });

    const job = await scoringQueue.add("score", {
      ideaId: ideaId || undefined,
      limit,
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: ideaId 
        ? `Scoring job queued for idea ${ideaId}`
        : `Scoring job queued for top ${limit} ideas`,
    });
  } catch (error) {
    console.error("Error queuing scoring job:", error);
    return NextResponse.json(
      { error: "Failed to queue scoring job", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    if (scoringQueue) {
      await scoringQueue.close();
    }
  }
}
