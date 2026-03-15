import { prisma } from "@/lib/prisma";
import { getRedditClient, type RedditPost } from "@/lib/reddit/client";
import { getHackerNewsClient, type HNStory } from "@/lib/hackernews/client";
import { getServerEnv } from "@/lib/env/server-env";

export type IdeaStatus = "discovered" | "scored" | "generating" | "completed" | "failed";
export type DataSource = "reddit" | "hackernews";

export interface CreateIdeaParams {
  sourceId: string;
  source: DataSource;
  title: string;
  url: string;
  description: string | null;
  author: string | null;
  upvotes: number;
  commentCount: number;
  sourceData: string;
}

/**
 * Create or update an idea from a Reddit post
 */
export async function upsertIdeaFromRedditPost(post: RedditPost): Promise<{ id: string; created: boolean }> {
  const idea = await prisma.idea.upsert({
    where: { redditId: post.id },
    create: {
      redditId: post.id,
      subreddit: post.subreddit,
      title: post.title,
      url: `https://reddit.com${post.permalink}`,
      description: post.is_self ? post.selftext : null,
      author: post.author,
      upvotes: post.ups,
      commentCount: post.num_comments,
      sourceData: JSON.stringify({
        created_utc: post.created_utc,
        permalink: post.permalink,
        url: post.url,
        is_self: post.is_self,
      }),
      status: "discovered",
    },
    update: {
      upvotes: post.ups,
      commentCount: post.num_comments,
    },
    select: { id: true },
  });

  return { id: idea.id, created: false };
}

/**
 * Create or update an idea from a Hacker News story
 */
export async function upsertIdeaFromHNStory(story: HNStory): Promise<{ id: string; created: boolean }> {
  const idea = await prisma.idea.upsert({
    where: { redditId: `hn_${story.id}` },
    create: {
      redditId: `hn_${story.id}`,
      subreddit: "hackernews",
      title: story.title,
      url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      description: story.text || null,
      author: story.by,
      upvotes: story.score,
      commentCount: story.descendants,
      sourceData: JSON.stringify({
        hnId: story.id,
        time: story.time,
        url: story.url,
        kids: story.kids,
      }),
      status: "discovered",
    },
    update: {
      upvotes: story.score,
      commentCount: story.descendants,
    },
    select: { id: true },
  });

  return { id: idea.id, created: false };
}

/**
 * Get an idea by ID
 */
export async function getIdeaById(id: string) {
  return prisma.idea.findUnique({
    where: { id },
    include: {
      experiments: {
        include: {
          files: true,
          executionResults: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

/**
 * List ideas with filters
 */
export interface ListIdeasParams {
  status?: IdeaStatus;
  subreddit?: string;
  minScore?: number;
  maxScore?: number;
  limit?: number;
  offset?: number;
  orderBy?: "createdAt" | "upvotes" | "compositeScore" | "commentCount";
  orderDir?: "asc" | "desc";
}

export async function listIdeas(params: ListIdeasParams = {}) {
  const {
    status,
    subreddit,
    minScore,
    maxScore,
    limit = 50,
    offset = 0,
    orderBy = "createdAt",
    orderDir = "desc",
  } = params;

  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  }

  if (subreddit) {
    where.subreddit = subreddit;
  }

  if (minScore !== undefined || maxScore !== undefined) {
    where.compositeScore = {};
    if (minScore !== undefined) {
      (where.compositeScore as Record<string, number>).gte = minScore;
    }
    if (maxScore !== undefined) {
      (where.compositeScore as Record<string, number>).lte = maxScore;
    }
  }

  const [ideas, total] = await Promise.all([
    prisma.idea.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { [orderBy]: orderDir },
    }),
    prisma.idea.count({ where }),
  ]);

  return { ideas, total, limit, offset };
}

/**
 * Update idea scores
 */
export async function updateIdeaScores(
  id: string,
  scores: {
    viralityScore: number;
    noveltyScore: number;
    feasibilityScore: number;
    compositeScore: number;
  }
) {
  return prisma.idea.update({
    where: { id },
    data: {
      ...scores,
      status: "scored",
    },
  });
}

/**
 * Update idea status
 */
export async function updateIdeaStatus(id: string, status: IdeaStatus, errorMessage?: string) {
  const data: Record<string, unknown> = { status };
  
  if (status === "failed" && errorMessage) {
    data.errorMessage = errorMessage; // Store error in dedicated field
  }

  return prisma.idea.update({
    where: { id },
    data,
  });
}

/**
 * Get top scored ideas ready for generation
 */
export async function getTopIdeasForGeneration(limit: number = 10) {
  return prisma.idea.findMany({
    where: {
      status: "scored",
      compositeScore: { gte: 50 },
    },
    take: limit,
    orderBy: { compositeScore: "desc" },
  });
}

/**
 * Discover ideas from configured data source (Reddit or Hacker News)
 */
export interface DiscoverIdeasParams {
  subreddits?: string[];  // For Reddit only
  postsPerSubreddit?: number;
  minUpvotes?: number;
}

export async function discoverIdeas(params: DiscoverIdeasParams = {}) {
  const env = getServerEnv();
  
  if (env.DATA_SOURCE === "hackernews") {
    return discoverIdeasFromHN(params);
  }
  
  return discoverIdeasFromReddit(params);
}

/**
 * Discover ideas from Hacker News
 */
export async function discoverIdeasFromHN(params: DiscoverIdeasParams = {}) {
  const { minUpvotes = 5 } = params;
  
  const client = getHackerNewsClient();
  
  // Get AI-related stories from HN
  const stories = await client.getAITopStories(50);
  
  let discoveredCount = 0;
  
  for (const story of stories) {
    // Filter by minimum upvotes
    if (story.score < minUpvotes) continue;
    
    const { id } = await upsertIdeaFromHNStory(story);
    discoveredCount++;
  }
  
  console.log(`HN Discovery: Found ${discoveredCount} AI-related stories`);
  return { discoveredCount };
}

/**
 * Discover ideas from Reddit (original method)
 */
export async function discoverIdeasFromReddit(params: DiscoverIdeasParams = {}) {
  const { subreddits, postsPerSubreddit = 25, minUpvotes = 5 } = params;

  const client = getRedditClient();
  
  // If no subreddits specified, get popular AI subreddits
  let targetSubreddits = subreddits;
  if (!targetSubreddits || targetSubreddits.length === 0) {
    const aiSubreddits = await client.getPopularAISubreddits();
    targetSubreddits = aiSubreddits.map((s) => s.name);
  }

  let discoveredCount = 0;

  for (const subreddit of targetSubreddits) {
    try {
      // Get hot posts
      const posts = await client.getHotPosts(subreddit, postsPerSubreddit);
      
      for (const post of posts) {
        // Filter by minimum upvotes
        if (post.ups < minUpvotes) continue;

        // Skip posts that are just images/links without description
        if (!post.is_self && post.selftext.length < 50) continue;

        const { id } = await upsertIdeaFromRedditPost(post);
        discoveredCount++;
      }
    } catch (error) {
      console.error(`Error fetching posts from r/${subreddit}:`, error);
    }
  }

  return { discoveredCount };
}

/**
 * Get ideas statistics
 */
export async function getIdeasStats() {
  const [
    total,
    discovered,
    scored,
    generating,
    completed,
    failed,
    avgScore,
    topSubreddits,
  ] = await Promise.all([
    prisma.idea.count(),
    prisma.idea.count({ where: { status: "discovered" } }),
    prisma.idea.count({ where: { status: "scored" } }),
    prisma.idea.count({ where: { status: "generating" } }),
    prisma.idea.count({ where: { status: "completed" } }),
    prisma.idea.count({ where: { status: "failed" } }),
    prisma.idea.aggregate({ _avg: { compositeScore: true } }),
    prisma.idea.groupBy({
      by: ["subreddit"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
  ]);

  return {
    total,
    byStatus: { discovered, scored, generating, completed, failed },
    avgScore: avgScore._avg.compositeScore || 0,
    topSubreddits,
  };
}
