import { prisma } from "@/lib/prisma";
import { getRedditClient } from "@/lib/reddit/client";
import { updateIdeaScores, getTopIdeasForGeneration } from "@/lib/ideas/service";
import { emitActivityLog, createActivityLogEntry } from "@/lib/instrumentation/activity-log";
import { QueueNames } from "./queue-names";
import { getServerEnv } from "@/lib/env/server-env";

export interface IdeaScoringJob {
  ideaId?: string; // If not provided, score top ideas
  limit?: number;
}

/**
 * Get the referer URL for OpenRouter API calls
 */
function getOpenRouterReferer(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

/**
 * Get the model to use from the allowlist, with fallback for empty array
 */
function getModelFromAllowlist(): string {
  const env = getServerEnv();
  const allowlist = env.OPENROUTER_FREE_MODEL_ALLOWLIST;
  if (!allowlist || allowlist.length === 0) {
    return "google/gemini-2.0-flash-exp:free";
  }
  return allowlist[0];
}

/**
 * Score ideas using LLM
 */
export async function processIdeaScoring(jobData: IdeaScoringJob): Promise<{
  scoredCount: number;
}> {
  console.log("Starting idea scoring...", jobData);

  const model = getModelFromAllowlist();
  const client = getRedditClient();

  let ideas;
  if (jobData.ideaId) {
    const idea = await prisma.idea.findUnique({ where: { id: jobData.ideaId } });
    ideas = idea ? [idea] : [];
  } else {
    // Get ideas that need scoring (discovered but not scored)
    ideas = await prisma.idea.findMany({
      where: { status: "discovered" },
      take: jobData.limit ?? 10,
      orderBy: { upvotes: "desc" },
    });
  }

  let scoredCount = 0;

  for (const idea of ideas) {
    try {
      // Calculate virality score (0-100)
      const viralityScore = Math.min(100, Math.round(
        (idea.upvotes / 100) * 50 + 
        (idea.commentCount / 50) * 30 +
        (idea.commentCount > 0 ? 20 : 0)
      ));

      // Use LLM for novelty and feasibility scores
      const { noveltyScore, feasibilityScore } = await analyzeIdeaWithLLM(
        idea.title,
        idea.description,
        model
      );

      // Calculate composite score
      const compositeScore = Math.round(
        viralityScore * 0.3 + 
        noveltyScore * 0.4 + 
        feasibilityScore * 0.3
      );

      // Update idea with scores
      await updateIdeaScores(idea.id, {
        viralityScore,
        noveltyScore,
        feasibilityScore,
        compositeScore,
      });

      scoredCount++;

      emitActivityLog(
        createActivityLogEntry({
          event: "idea.scored",
          level: "info",
          queue: QueueNames.IdeaScoring,
          jobId: idea.id,
          correlationId: idea.id,
          data: {
            ideaId: idea.id,
            viralityScore,
            noveltyScore,
            feasibilityScore,
            compositeScore,
          },
        })
      );
    } catch (error) {
      console.error(`Error scoring idea ${idea.id}:`, error);
      
      emitActivityLog(
        createActivityLogEntry({
          event: "idea.scoring_failed",
          level: "error",
          queue: QueueNames.IdeaScoring,
          jobId: idea.id,
          correlationId: idea.id,
          data: {
            ideaId: idea.id,
            error: error instanceof Error ? error.message : String(error),
          },
        })
      );
    }
  }

  console.log(`Scoring complete. Scored ${scoredCount} ideas.`);
  return { scoredCount };
}

/**
 * Analyze idea using LLM
 */
async function analyzeIdeaWithLLM(
  title: string,
  description: string | null,
  model: string
): Promise<{ noveltyScore: number; feasibilityScore: number }> {
  const prompt = `Analyze this AI idea and provide two scores (0-100):

Idea Title: ${title}
Idea Description: ${description || "No description"}

Respond in this exact format:
NOVELTY: <number>
FEASIBILITY: <number>

Where:
- NOVELTY: How unique/innovative is this idea? (0 = common, 100 = groundbreaking)
- FEASIBILITY: How realistic is it to implement this as code? (0 = impossible, 100 = straightforward)

Respond with ONLY the two lines, nothing else.`;

  try {
    const env = getServerEnv();
    
    if (!env.OPENROUTER_API_KEY) {
      console.error("OPENROUTER_API_KEY not configured, using default scores");
      return { noveltyScore: 50, feasibilityScore: 50 };
    }
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": getOpenRouterReferer(),
        "X-Title": "AI Idea Intelligence",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 50,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error("LLM scoring failed:", await response.text());
      return { noveltyScore: 50, feasibilityScore: 50 }; // Default scores
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse scores from response
    const noveltyMatch = content.match(/NOVELTY:\s*(\d+)/i);
    const feasibilityMatch = content.match(/FEASIBILITY:\s*(\d+)/i);

    return {
      noveltyScore: noveltyMatch ? Math.min(100, Math.max(0, parseInt(noveltyMatch[1]))) : 50,
      feasibilityScore: feasibilityMatch ? Math.min(100, Math.max(0, parseInt(feasibilityMatch[1]))) : 50,
    };
  } catch (error) {
    console.error("Error in LLM analysis:", error);
    return { noveltyScore: 50, feasibilityScore: 50 };
  }
}
