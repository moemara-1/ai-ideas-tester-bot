import { z } from "zod";

const DELIMITER = ",";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATA_SOURCE: z.enum(["reddit", "hackernews"]).default("hackernews"),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_FREE_MODEL_ALLOWLIST: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  
  // Reddit API (required only if DATA_SOURCE=reddit)
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USER_AGENT: z.string().optional(),
  
  // Optional - for backward compatibility
  APP_URL: z.string().url().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  OPENCLAW_API_KEY: z.string().optional(),
});

type RawServerEnv = z.infer<typeof EnvSchema>;

export type ServerEnv = Omit<RawServerEnv, "OPENROUTER_FREE_MODEL_ALLOWLIST"> & {
  OPENROUTER_FREE_MODEL_ALLOWLIST: string[];
};

let cachedEnv: ServerEnv | null = null;

function toAllowlist(rawAllowlist: string): string[] {
  const models = rawAllowlist
    .split(DELIMITER)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (models.length === 0) {
    throw new Error("OPENROUTER_FREE_MODEL_ALLOWLIST must contain at least one model.");
  }

  return Array.from(new Set(models));
}

function formatError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const key = issue.path.join(".") || "env";
      return `- ${key}: ${issue.message}`;
    })
    .join("\n");
}

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${formatError(parsed.error)}`);
  }

  const validatedEnv: ServerEnv = {
    ...parsed.data,
    OPENROUTER_FREE_MODEL_ALLOWLIST: toAllowlist(parsed.data.OPENROUTER_FREE_MODEL_ALLOWLIST),
  };

  cachedEnv = validatedEnv;
  return validatedEnv;
}
