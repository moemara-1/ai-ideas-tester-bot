import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
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

test("e2e: builder + outreach produces compliant messages and honors suppression", async () => {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dbRelative = `prisma/e2e-builder-outreach-${nonce}.db`;
  const dbAbsolute = path.join(rootDir, dbRelative);
  const databaseUrl = `file:${dbAbsolute}`;

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
  };

  const previousDatabaseUrl = process.env.DATABASE_URL;

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

    const [{ createCampaign, listLeads, runBuilderOutreach }, { prisma }] = await Promise.all([
      import("@/lib/campaigns/service"),
      import("@/lib/prisma"),
    ]);

    const createResult = await createCampaign({
      name: "Builder Outreach E2E Campaign",
      description: "builder outreach vertical slice test",
      targetRegion: "Austin, TX",
      targetVertical: "HVAC",
      idempotencyKey: `builder-outreach:${nonce}`,
      runIdeaPipeline: false,
      maxSourceSignals: 1,
      experimentsPerSignal: 1,
      runScoutIntel: true,
      maxScoutBusinesses: 2,
    });

    const leads = await listLeads({
      campaignId: createResult.campaign.id,
      limit: 10,
    });

    assert.equal(leads.length, 2);

    const suppressedLeadId = leads[0]!.id;
    await prisma.lead.update({
      where: {
        id: suppressedLeadId,
      },
      data: {
        suppressedAt: new Date(),
      },
    });

    const summary = await runBuilderOutreach(createResult.campaign.id, {
      limit: 10,
    });

    assert.equal(summary.leadsConsidered, 2);
    assert.equal(summary.outreachSent, 1);
    assert.equal(summary.suppressedSkipped, 1);
    assert.equal(summary.invalidDemoUrlSkipped, 0);
    assert.equal(summary.missingEmailSkipped, 0);

    const sentOutreach = await prisma.outreachMessage.findFirst({
      where: {
        campaignId: createResult.campaign.id,
        status: "sent",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(sentOutreach);

    const sentLead = await prisma.lead.findUnique({
      where: {
        id: sentOutreach!.leadId,
      },
      include: {
        demoSites: true,
      },
    });

    assert.ok(sentLead);
    assert.equal(sentLead!.status, "outreach_sent");
    assert.ok(sentLead!.demoSites.length >= 1);

    const deployedDemo = sentLead!.demoSites.find((site) => site.status === "deployed");
    assert.ok(deployedDemo);
    assert.match(deployedDemo!.productionUrl ?? "", /^https:\/\/[a-z0-9-]+\.pages\.dev\/?$/);
    assert.match(deployedDemo!.previewUrl ?? "", /^https:\/\/preview\.[a-z0-9-]+\.pages\.dev\/?$/);

    assert.ok(sentOutreach!.bodyText?.includes(deployedDemo!.productionUrl ?? ""));
    assert.match(sentOutreach!.bodyText ?? "", /unsubscribe/i);
    assert.match(sentOutreach!.bodyText ?? "", /unsubscribe\.openclaw\.local/);

    const suppressedLead = await prisma.lead.findUnique({
      where: {
        id: suppressedLeadId,
      },
      include: {
        outreachMessages: true,
      },
    });

    assert.ok(suppressedLead);
    assert.equal(suppressedLead!.status, "disqualified");
    assert.equal(
      suppressedLead!.outreachMessages.some((message) => message.status === "sent"),
      false
    );

    const rerun = await runBuilderOutreach(createResult.campaign.id, {
      limit: 10,
    });
    assert.equal(rerun.alreadySentSkipped, 1);

    await prisma.$disconnect();
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    await rm(dbAbsolute, { force: true });
    await rm(`${dbAbsolute}-journal`, { force: true });
  }
});
