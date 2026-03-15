import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import { z } from "zod";
import { makeRedisConnectionOptions } from "@/workers/redis-connection";
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

const GenerateRequestSchema = z.object({
  ideaId: z.string().min(1, "ideaId is required"),
  projectType: z.enum(["agent", "api", "script", "webapp"]).optional(),
});

type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export async function POST(request: Request) {
  let generationQueue: Queue | null = null;
  
  try {
    // Apply rate limiting
    const rateLimitConfig = RATE_LIMITS.generate;
    const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const isAllowed = checkRateLimit(`generate:${clientIp}`, rateLimitConfig);
    
    if (!isAllowed) {
      const headers = getRateLimitHeaders(`generate:${clientIp}`, rateLimitConfig);
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429, headers }
      );
    }
    
    const bodyRaw = await request.json().catch(() => ({}));
    const parsed = GenerateRequestSchema.safeParse(bodyRaw);
    
    if (!parsed.success) {
      return NextResponse.json(
        { 
          error: "Invalid request parameters", 
          details: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`) 
        },
        { status: 400 }
      );
    }
    
    const { ideaId, projectType }: GenerateRequest = parsed.data;

    // Create queue and add job
    const connection = makeRedisConnectionOptions(process.env.REDIS_URL || "redis://localhost:6379");
    generationQueue = new Queue("idea.code_generation", { connection });

    const job = await generationQueue.add("generate", {
      ideaId,
      projectType,
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: `Code generation job queued for idea ${ideaId}`,
    });
  } catch (error) {
    console.error("Error queuing generation job:", error);
    return NextResponse.json(
      { error: "Failed to queue generation job", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    if (generationQueue) {
      await generationQueue.close();
    }
  }
}
