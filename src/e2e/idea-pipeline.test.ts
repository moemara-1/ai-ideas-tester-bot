import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const migrationFile = "prisma/migrations/20260308223451_init_sqlite/migration.sql";

async function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await execFileAsync(command, args, {
    cwd: rootDir,
    env,
    maxBuffer: 1024 * 1024 * 8,
  });
}

test("e2e: intelligence idea pipeline ingests source signals and emits experiment/report artifacts", async () => {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dbRelative = `prisma/e2e-idea-pipeline-${nonce}.db`;
  const dbAbsolute = path.join(rootDir, dbRelative);
  const databaseUrl = `file:${dbAbsolute}`;

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
  };

  const previousDatabaseUrl = process.env.DATABASE_URL;
  let campaignSlug = "";

  await mkdir(path.dirname(dbAbsolute), { recursive: true });

  try {
    await run(
      "npx",
      [
        "prisma",
        "db",
        "execute",
        "--schema",
        "prisma/schema.prisma",
        "--file",
        migrationFile,
      ],
      env
    );

    process.env.DATABASE_URL = databaseUrl;

    const [{ createCampaign, listLeads }, { prisma }] = await Promise.all([
      import("@/lib/campaigns/service"),
      import("@/lib/prisma"),
    ]);

    const createResult = await createCampaign({
      name: "Idea Pipeline E2E",
      description: "intelligence baseline validation",
      targetRegion: "North America",
      targetVertical: "AI B2B tools",
      idempotencyKey: `idea-pipeline:${nonce}`,
      pipelineMode: "idea_intelligence",
      runIdeaPipeline: true,
      maxSourceSignals: 3,
      experimentsPerSignal: 1,
      seedSignals: [
        {
          title: "Founders sharing repeated GPT onboarding drop-off issues",
          source: "reddit",
          summary: "Threads asking for faster onboarding audits for AI SaaS teams.",
          engagementCount: 480,
        },
        {
          title: "High-save posts on AI agent handoff reliability checklists",
          source: "x",
          summary: "Operators want repeatable reliability scorecards before launch.",
          engagementCount: 320,
        },
      ],
    });

    campaignSlug = createResult.campaign.slug;

    assert.equal(createResult.pipelineMode, "idea_intelligence");
    assert.ok(createResult.pipeline);
    assert.equal("mode" in createResult.pipeline!, true);

    const pivotSummary = createResult.pipeline as Exclude<typeof createResult.pipeline, null> & {
      mode: "idea_intelligence";
      sourceItemsIngested: number;
      experimentsGenerated: number;
      reportArtifactPath: string;
      experimentArtifacts: string[];
    };

    assert.equal(pivotSummary.mode, "idea_intelligence");
    assert.equal(pivotSummary.sourceItemsIngested, 2);
    assert.ok(pivotSummary.experimentsGenerated >= 1);
    assert.ok(pivotSummary.reportArtifactPath.startsWith("artifacts/intelligence/reports/"));

    const reportPath = path.join(rootDir, pivotSummary.reportArtifactPath);
    await access(reportPath);

    const firstExperimentPath = pivotSummary.experimentArtifacts[0];
    assert.ok(firstExperimentPath);
    await access(path.join(rootDir, firstExperimentPath));

    const leads = await listLeads({
      campaignId: createResult.campaign.id,
      limit: 10,
    });
    assert.ok(leads.length >= 2);
    assert.equal(leads.some((lead) => lead.status === "report_published"), true);

    const reportLog = await prisma.activityLog.findFirst({
      where: {
        campaignId: createResult.campaign.id,
        event: "report.generated",
      },
    });
    assert.ok(reportLog);

    await prisma.$disconnect();
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    await rm(dbAbsolute, { force: true });
    await rm(`${dbAbsolute}-journal`, { force: true });

    if (campaignSlug) {
      await rm(path.join(rootDir, "artifacts", "intelligence", "experiments", campaignSlug), {
        recursive: true,
        force: true,
      });
      await rm(path.join(rootDir, "artifacts", "intelligence", "reports", campaignSlug), {
        recursive: true,
        force: true,
      });
    }
  }
});
