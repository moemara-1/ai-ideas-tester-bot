import { discoverIdeasFromReddit } from "@/lib/ideas/service";
import { emitActivityLog, createActivityLogEntry } from "@/lib/instrumentation/activity-log";
import { QueueNames } from "./queue-names";

export interface IdeaDiscoveryJob {
  subreddits?: string[];
  postsPerSubreddit?: number;
  minUpvotes?: number;
}

/**
 * Process idea discovery job
 */
export async function processIdeaDiscovery(jobData: IdeaDiscoveryJob): Promise<{
  discoveredCount: number;
}> {
  console.log("Starting idea discovery...", jobData);

  const { discoveredCount } = await discoverIdeasFromReddit({
    subreddits: jobData.subreddits,
    postsPerSubreddit: jobData.postsPerSubreddit ?? 25,
    minUpvotes: jobData.minUpvotes ?? 5,
  });

  console.log(`Discovery complete. Discovered ${discoveredCount} ideas.`);

  emitActivityLog(
    createActivityLogEntry({
      event: "idea.discovery.completed",
      level: "info",
      queue: QueueNames.IdeaDiscovery,
      jobId: "discovery",
      correlationId: "discovery",
      data: { 
        message: `Discovered ${discoveredCount} new ideas from Reddit`,
        discoveredCount 
      },
    })
  );

  return { discoveredCount };
}
