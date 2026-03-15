import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SeedIds = {
  campaign: "seed_campaign_main",
  business: "seed_business_harbor",
  lead: "seed_lead_harbor",
  demoSite: "seed_demo_site_harbor",
  outreachMessage: "seed_outreach_message_harbor",
  payment: "seed_payment_harbor",
  agentRun: "seed_agent_run_harbor",
  activityLog: "seed_activity_log_harbor",
} as const;

const SeedKeys = {
  campaign: "seed:campaign:harbor-hvac-q2",
  business: "seed:business:harbor-hvac",
  lead: "seed:lead:harbor-hvac-owner",
  demoSite: "seed:demo-site:harbor-hvac",
  outreachMessage: "seed:outreach:harbor-hvac:001",
  payment: "seed:payment:harbor-hvac:001",
  agentRun: "seed:agent-run:lead.outreach:harbor-hvac:1",
  activityLog: "seed:activity-log:lead.outreach:sent",
} as const;

const FIXED_SENT_AT = new Date("2026-01-15T10:30:00.000Z");
const FIXED_OCCURRED_AT = new Date("2026-01-15T10:31:00.000Z");

async function seedCampaignGraph(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.upsert({
      where: { idempotencyKey: SeedKeys.campaign },
      update: {
        id: SeedIds.campaign,
        slug: "harbor-hvac-q2",
        name: "Harbor HVAC - Q2 Local Outreach",
        description: "Seed fixture campaign for deterministic local development.",
        status: "active",
        targetRegion: "Greater Seattle",
        targetVertical: "HVAC Services",
        targetingConfig: JSON.stringify({
          region: "Seattle, WA",
          idealTitles: ["Owner", "Operations Manager"],
        }),
      },
      create: {
        id: SeedIds.campaign,
        slug: "harbor-hvac-q2",
        name: "Harbor HVAC - Q2 Local Outreach",
        description: "Seed fixture campaign for deterministic local development.",
        status: "active",
        targetRegion: "Greater Seattle",
        targetVertical: "HVAC Services",
        targetingConfig: JSON.stringify({
          region: "Seattle, WA",
          idealTitles: ["Owner", "Operations Manager"],
        }),
        idempotencyKey: SeedKeys.campaign,
      },
    });

    const business = await tx.business.upsert({
      where: { idempotencyKey: SeedKeys.business },
      update: {
        id: SeedIds.business,
        campaignId: campaign.id,
        source: "google_maps",
        externalSourceId: "place:harbor-hvac-001",
        name: "Harbor HVAC",
        normalizedName: "harbor hvac",
        websiteUrl: "https://harborhvac.example",
        normalizedDomain: "harborhvac.example",
        phone: "+1-206-555-0111",
        primaryEmail: "info@harborhvac.example",
        addressLine1: "1200 Elliott Ave",
        city: "Seattle",
        state: "WA",
        country: "US",
        postalCode: "98101",
        metadata: JSON.stringify({
          scoutProvider: "google_maps",
          mapsRating: 4.7,
        }),
      },
      create: {
        id: SeedIds.business,
        campaignId: campaign.id,
        source: "google_maps",
        externalSourceId: "place:harbor-hvac-001",
        name: "Harbor HVAC",
        normalizedName: "harbor hvac",
        websiteUrl: "https://harborhvac.example",
        normalizedDomain: "harborhvac.example",
        phone: "+1-206-555-0111",
        primaryEmail: "info@harborhvac.example",
        addressLine1: "1200 Elliott Ave",
        city: "Seattle",
        state: "WA",
        country: "US",
        postalCode: "98101",
        metadata: JSON.stringify({
          scoutProvider: "google_maps",
          mapsRating: 4.7,
        }),
        idempotencyKey: SeedKeys.business,
      },
    });

    const lead = await tx.lead.upsert({
      where: { idempotencyKey: SeedKeys.lead },
      update: {
        id: SeedIds.lead,
        campaignId: campaign.id,
        businessId: business.id,
        status: "outreach_sent",
        score: 82,
        firstName: "Jordan",
        lastName: "Rivera",
        fullName: "Jordan Rivera",
        title: "Owner",
        contactEmail: "jordan@harborhvac.example",
        contactPhone: "+1-206-555-0141",
        linkedinUrl: "https://linkedin.example/jordan-rivera",
        websiteSummary: "Local HVAC provider with weak conversion flow on mobile pages.",
        qualificationNotes: "Strong ICP fit, owner reachable by email.",
        metadata: JSON.stringify({
          fit: "high",
          source: "intel",
        }),
      },
      create: {
        id: SeedIds.lead,
        campaignId: campaign.id,
        businessId: business.id,
        status: "outreach_sent",
        score: 82,
        firstName: "Jordan",
        lastName: "Rivera",
        fullName: "Jordan Rivera",
        title: "Owner",
        contactEmail: "jordan@harborhvac.example",
        contactPhone: "+1-206-555-0141",
        linkedinUrl: "https://linkedin.example/jordan-rivera",
        websiteSummary: "Local HVAC provider with weak conversion flow on mobile pages.",
        qualificationNotes: "Strong ICP fit, owner reachable by email.",
        metadata: JSON.stringify({
          fit: "high",
          source: "intel",
        }),
        idempotencyKey: SeedKeys.lead,
      },
    });

    const demoSite = await tx.demoSite.upsert({
      where: { idempotencyKey: SeedKeys.demoSite },
      update: {
        id: SeedIds.demoSite,
        campaignId: campaign.id,
        leadId: lead.id,
        status: "deployed",
        provider: "cloudflare_pages",
        deploymentId: "cf-pages-seed-001",
        productionUrl: "https://harbor-hvac-demo.pages.dev",
        previewUrl: "https://preview.harbor-hvac-demo.pages.dev",
        templateName: "hvac-modern",
        buildArtifactPath: "seed-artifacts/harbor-hvac",
        deployedAt: FIXED_SENT_AT,
      },
      create: {
        id: SeedIds.demoSite,
        campaignId: campaign.id,
        leadId: lead.id,
        status: "deployed",
        provider: "cloudflare_pages",
        deploymentId: "cf-pages-seed-001",
        productionUrl: "https://harbor-hvac-demo.pages.dev",
        previewUrl: "https://preview.harbor-hvac-demo.pages.dev",
        templateName: "hvac-modern",
        buildArtifactPath: "seed-artifacts/harbor-hvac",
        deployedAt: FIXED_SENT_AT,
        idempotencyKey: SeedKeys.demoSite,
      },
    });

    const outreachMessage = await tx.outreachMessage.upsert({
      where: { idempotencyKey: SeedKeys.outreachMessage },
      update: {
        id: SeedIds.outreachMessage,
        campaignId: campaign.id,
        leadId: lead.id,
        channel: "email",
        provider: "resend",
        status: "sent",
        toEmail: "jordan@harborhvac.example",
        fromEmail: "hello@openclaw.example",
        subject: "Quick website conversion win for Harbor HVAC",
        bodyText:
          "Jordan, we built a live demo page showing how Harbor HVAC could increase booked calls from mobile visitors.",
        providerMessageId: "resend-seed-msg-001",
        sentAt: FIXED_SENT_AT,
      },
      create: {
        id: SeedIds.outreachMessage,
        campaignId: campaign.id,
        leadId: lead.id,
        channel: "email",
        provider: "resend",
        status: "sent",
        toEmail: "jordan@harborhvac.example",
        fromEmail: "hello@openclaw.example",
        subject: "Quick website conversion win for Harbor HVAC",
        bodyText:
          "Jordan, we built a live demo page showing how Harbor HVAC could increase booked calls from mobile visitors.",
        providerMessageId: "resend-seed-msg-001",
        sentAt: FIXED_SENT_AT,
        idempotencyKey: SeedKeys.outreachMessage,
      },
    });

    const payment = await tx.payment.upsert({
      where: { idempotencyKey: SeedKeys.payment },
      update: {
        id: SeedIds.payment,
        campaignId: campaign.id,
        leadId: lead.id,
        outreachMessageId: outreachMessage.id,
        provider: "stripe",
        status: "checkout_pending",
        currency: "USD",
        amountCents: 2900,
        checkoutSessionId: "cs_seed_001",
        paymentUrl: "https://checkout.stripe.com/pay/cs_seed_001",
      },
      create: {
        id: SeedIds.payment,
        campaignId: campaign.id,
        leadId: lead.id,
        outreachMessageId: outreachMessage.id,
        provider: "stripe",
        status: "checkout_pending",
        currency: "USD",
        amountCents: 2900,
        checkoutSessionId: "cs_seed_001",
        paymentUrl: "https://checkout.stripe.com/pay/cs_seed_001",
        idempotencyKey: SeedKeys.payment,
      },
    });

    const agentRun = await tx.agentRun.upsert({
      where: { idempotencyKey: SeedKeys.agentRun },
      update: {
        id: SeedIds.agentRun,
        campaignId: campaign.id,
        leadId: lead.id,
        queueName: "lead.outreach",
        jobId: lead.id,
        jobName: "outreach.send",
        runKey: `lead.outreach:${lead.id}`,
        status: "completed",
        triggerSource: "queue",
        attempt: 1,
        maxAttempts: 3,
        correlationId: `lead.outreach:${lead.id}`,
        startedAt: FIXED_SENT_AT,
        finishedAt: FIXED_OCCURRED_AT,
        durationMs: 1000,
        output: JSON.stringify({
          outreachMessageId: outreachMessage.id,
          demoSiteId: demoSite.id,
          paymentId: payment.id,
        }),
      },
      create: {
        id: SeedIds.agentRun,
        campaignId: campaign.id,
        leadId: lead.id,
        queueName: "lead.outreach",
        jobId: lead.id,
        jobName: "outreach.send",
        runKey: `lead.outreach:${lead.id}`,
        status: "completed",
        triggerSource: "queue",
        attempt: 1,
        maxAttempts: 3,
        correlationId: `lead.outreach:${lead.id}`,
        startedAt: FIXED_SENT_AT,
        finishedAt: FIXED_OCCURRED_AT,
        durationMs: 1000,
        output: JSON.stringify({
          outreachMessageId: outreachMessage.id,
          demoSiteId: demoSite.id,
          paymentId: payment.id,
        }),
        idempotencyKey: SeedKeys.agentRun,
      },
    });

    await tx.activityLog.upsert({
      where: { idempotencyKey: SeedKeys.activityLog },
      update: {
        id: SeedIds.activityLog,
        campaignId: campaign.id,
        leadId: lead.id,
        agentRunId: agentRun.id,
        entityType: "lead",
        entityId: lead.id,
        event: "lead.outreach.sent",
        level: "info",
        queueName: "lead.outreach",
        jobId: lead.id,
        correlationId: `lead.outreach:${lead.id}`,
        message: "Seed outreach job sent a deterministic fixture email.",
        payload: JSON.stringify({
          outreachMessageId: outreachMessage.id,
          demoSiteId: demoSite.id,
          paymentId: payment.id,
        }),
        occurredAt: FIXED_OCCURRED_AT,
      },
      create: {
        id: SeedIds.activityLog,
        campaignId: campaign.id,
        leadId: lead.id,
        agentRunId: agentRun.id,
        entityType: "lead",
        entityId: lead.id,
        event: "lead.outreach.sent",
        level: "info",
        queueName: "lead.outreach",
        jobId: lead.id,
        correlationId: `lead.outreach:${lead.id}`,
        message: "Seed outreach job sent a deterministic fixture email.",
        payload: JSON.stringify({
          outreachMessageId: outreachMessage.id,
          demoSiteId: demoSite.id,
          paymentId: payment.id,
        }),
        occurredAt: FIXED_OCCURRED_AT,
        idempotencyKey: SeedKeys.activityLog,
      },
    });
  });
}

async function main(): Promise<void> {
  await seedCampaignGraph();

  console.info("Deterministic seed complete.");
  console.info(
    JSON.stringify(
      {
        campaignId: SeedIds.campaign,
        leadId: SeedIds.lead,
        outreachMessageId: SeedIds.outreachMessage,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
