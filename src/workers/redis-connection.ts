import type { ConnectionOptions } from "bullmq";

export function makeRedisConnectionOptions(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  const dbSegment = parsed.pathname.replace("/", "");
  const db = dbSegment ? Number(dbSegment) : 0;

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: Number.isNaN(db) ? 0 : db,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}
