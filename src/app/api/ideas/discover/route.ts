import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import { z } from "zod";
import { makeRedisConnectionOptions } from "@/workers/redis-connection";
import { QueueNames } from "@/workers/queue-names";
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

const DiscoverRequestSchema = z.object({
  subreddits: z.array(z.string()).optional(),
  postsPerSubreddit: z.number().min(1).max(100).default(25),
  minUpvotes: z.number().min(0).max(10000).default(5),
});

type DiscoverRequest = z.infer<typeof DiscoverRequestSchema>;

export async function POST(request: Request) {
  try {
    // Apply rate limiting
    const rateLimitConfig = RATE_LIMITS.discovery;
    const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const isAllowed = checkRateLimit(`discovery:${clientIp}`, rateLimitConfig);
    
    if (!isAllowed) {
      const headers = getRateLimitHeaders(`discovery:${clientIp}`, rateLimitConfig);
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429, headers }
      );
    }
    
    const bodyRaw = await request.json().catch(() => ({}));
    const parsed = DiscoverRequestSchema.safeParse(bodyRaw);
    
    if (!parsed.success) {
      return NextResponse.json(
        { 
          error: "Invalid request parameters", 
          details: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`) 
        },
        { status: 400 }
      );
    }
    
    const { subreddits, postsPerSubreddit, minUpvotes }: DiscoverRequest = parsed.data;

    // Create queue and add job
    const connection = makeRedisConnectionOptions(process.env.REDIS_URL || "redis://localhost:6379");
    const discoveryQueue = new Queue("idea.discovery", { connection });

    const job = await discoveryQueue.add("discover", {
      subreddits,
      postsPerSubreddit,
      minUpvotes,
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: `Discovery job queued. Found ${postsPerSubreddit} posts per subreddit with minimum ${minUpvotes} upvotes.`,
    });
  } catch (error) {
    console.error("Error queuing discovery job:", error);
    return NextResponse.json(
      { error: "Failed to queue discovery job", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
