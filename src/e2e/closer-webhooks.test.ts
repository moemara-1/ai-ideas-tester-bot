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

test("e2e: resend + stripe webhooks are replay-safe and drive conversion state", async () => {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dbRelative = `prisma/e2e-webhooks-${nonce}.db`;
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

    const [{ processResendWebhook }, { processStripeWebhook }, { signResendPayload, signStripePayload }, { prisma }] =
      await Promise.all([
        import("@/lib/webhooks/resend"),
        import("@/lib/webhooks/stripe"),
        import("@/lib/webhooks/signature"),
        import("@/lib/prisma"),
      ]);

    const campaign = await prisma.campaign.create({
      data: {
        slug: `closer-webhook-${nonce}`,
        name: "Closer Webhook Campaign",
        status: "active",
        idempotencyKey: `campaign:${nonce}`,
      },
    });

    const business = await prisma.business.create({
      data: {
        campaignId: campaign.id,
        source: "google_maps",
        name: "Webhook Plumbing",
        normalizedName: "webhook plumbing",
        idempotencyKey: `business:${nonce}`,
      },
    });

    const lead = await prisma.lead.create({
      data: {
        campaignId: campaign.id,
        businessId: business.id,
        status: "outreach_sent",
        idempotencyKey: `lead:${nonce}`,
      },
    });

    const outreach = await prisma.outreachMessage.create({
      data: {
        campaignId: campaign.id,
        leadId: lead.id,
        channel: "email",
        provider: "resend",
        status: "sent",
        toEmail: "owner@example.com",
        providerMessageId: `resend-msg-${nonce}`,
        idempotencyKey: `outreach:${nonce}`,
      },
    });

    const resendSecret = "resend_test_secret";
    const resendPayload = JSON.stringify({
      id: `evt_resend_${nonce}`,
      type: "email.replied",
      data: {
        email_id: outreach.providerMessageId,
        text: "Looks good. Please send pricing and payment link.",
      },
    });

    const resendResult = await processResendWebhook({
      rawBody: resendPayload,
      signatureHeader: signResendPayload(resendSecret, resendPayload),
      secret: resendSecret,
    });

    assert.equal(resendResult.handled, true);
    assert.equal(resendResult.action, "payment_link_issued");

    const paymentAfterReply = await prisma.payment.findFirst({
      where: {
        leadId: lead.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(paymentAfterReply);
    assert.equal(paymentAfterReply.status, "checkout_pending");
    assert.ok(paymentAfterReply.paymentUrl?.startsWith("https://checkout.stripe.com/pay/"));

    const replayResult = await processResendWebhook({
      rawBody: resendPayload,
      signatureHeader: signResendPayload(resendSecret, resendPayload),
      secret: resendSecret,
    });

    assert.equal(replayResult.replayed, true);
    assert.equal(replayResult.action, "duplicate_ignored");

    const paymentCount = await prisma.payment.count({
      where: {
        leadId: lead.id,
      },
    });
    assert.equal(paymentCount, 1);

    const stripeSecret = "stripe_test_secret";
    const timestamp = Math.floor(Date.now() / 1000);
    const stripePayload = JSON.stringify({
      id: `evt_stripe_${nonce}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: paymentAfterReply.checkoutSessionId,
          payment_intent: `pi_${nonce}`,
          metadata: {
            paymentId: paymentAfterReply.id,
          },
        },
      },
    });

    const stripeSignature = `t=${timestamp},v1=${signStripePayload(stripeSecret, stripePayload, timestamp)}`;

    const stripeResult = await processStripeWebhook({
      rawBody: stripePayload,
      signatureHeader: stripeSignature,
      secret: stripeSecret,
    });

    assert.equal(stripeResult.handled, true);
    assert.equal(stripeResult.action, "payment_succeeded");

    const paymentAfterStripe = await prisma.payment.findUnique({
      where: {
        id: paymentAfterReply.id,
      },
    });
    assert.ok(paymentAfterStripe);
    assert.equal(paymentAfterStripe.status, "succeeded");

    const leadAfterStripe = await prisma.lead.findUnique({
      where: {
        id: lead.id,
      },
    });
    assert.ok(leadAfterStripe);
    assert.equal(leadAfterStripe.status, "payment_completed");

    const schedulerFallback = await prisma.activityLog.findUnique({
      where: {
        idempotencyKey: `scheduler:fallback:${lead.id}`,
      },
    });
    assert.ok(schedulerFallback);

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
