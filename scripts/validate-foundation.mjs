import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const REQUIRED_FILES = [
  "README.md",
  ".env.example",
  "docs/architecture.md",
  "docs/repo-audit.md",
  "docs/mvp-build-plan.md",
  "docs/pr-sequence.md",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/lib/env/server-env.ts",
  "src/lib/openrouter/free-model-gate.ts",
  "src/workers/worker.ts",
];

const REQUIRED_ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_FREE_MODEL_ALLOWLIST",
  "GOOGLE_MAPS_API_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "REDIS_URL",
  "DATABASE_URL",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
];

const REQUIRED_ARCH_SECTIONS = [
  "## Queue Topology",
  "## Core Domain Model (minimum)",
  "## Reliability and Safety Controls",
];

const REQUIRED_PACKAGE_SCRIPTS = [
  "dev",
  "build",
  "start",
  "typecheck",
  "worker",
  "validate:env",
  "validate:foundation",
  "check",
];

async function assertFileExists(filePath) {
  await access(filePath, constants.R_OK);
}

async function main() {
  const missingFiles = [];

  for (const filePath of REQUIRED_FILES) {
    try {
      await assertFileExists(filePath);
    } catch {
      missingFiles.push(filePath);
    }
  }

  if (missingFiles.length > 0) {
    console.error("Missing required foundation files:");
    for (const filePath of missingFiles) {
      console.error(`- ${filePath}`);
    }
    process.exit(1);
  }

  const envText = await readFile(".env.example", "utf8");
  const envKeys = new Set(
    envText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => line.split("=")[0].trim())
  );

  const missingEnvKeys = REQUIRED_ENV_KEYS.filter((key) => !envKeys.has(key));
  if (missingEnvKeys.length > 0) {
    console.error("Missing required environment keys in .env.example:");
    for (const key of missingEnvKeys) {
      console.error(`- ${key}`);
    }
    process.exit(1);
  }

  const architecture = await readFile("docs/architecture.md", "utf8");
  const missingSections = REQUIRED_ARCH_SECTIONS.filter(
    (section) => !architecture.includes(section)
  );

  if (missingSections.length > 0) {
    console.error("docs/architecture.md is missing required sections:");
    for (const section of missingSections) {
      console.error(`- ${section}`);
    }
    process.exit(1);
  }

  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const scripts = packageJson.scripts ?? {};
  const missingScripts = REQUIRED_PACKAGE_SCRIPTS.filter((name) => !scripts[name]);

  if (missingScripts.length > 0) {
    console.error("package.json is missing required scripts:");
    for (const script of missingScripts) {
      console.error(`- ${script}`);
    }
    process.exit(1);
  }

  console.log("Foundation validation passed.");
}

main().catch((error) => {
  console.error("Foundation validation failed with unexpected error:", error);
  process.exit(1);
});
