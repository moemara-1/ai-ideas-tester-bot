-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "targetRegion" TEXT,
    "targetVertical" TEXT,
    "targetingConfig" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'google_maps',
    "externalSourceId" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "normalizedDomain" TEXT,
    "phone" TEXT,
    "primaryEmail" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Business_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "score" INTEGER,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT,
    "title" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "linkedinUrl" TEXT,
    "websiteSummary" TEXT,
    "qualificationNotes" TEXT,
    "suppressedAt" DATETIME,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lead_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DemoSite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "provider" TEXT NOT NULL DEFAULT 'cloudflare_pages',
    "deploymentId" TEXT,
    "productionUrl" TEXT,
    "previewUrl" TEXT,
    "templateName" TEXT,
    "buildArtifactPath" TEXT,
    "lastBuildError" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "deployedAt" DATETIME,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DemoSite_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DemoSite_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "toEmail" TEXT NOT NULL,
    "fromEmail" TEXT,
    "subject" TEXT,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "providerMessageId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "sendAfter" DATETIME,
    "sentAt" DATETIME,
    "deliveredAt" DATETIME,
    "openedAt" DATETIME,
    "repliedAt" DATETIME,
    "bouncedAt" DATETIME,
    "failureReason" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutreachMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutreachMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "outreachMessageId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "status" TEXT NOT NULL DEFAULT 'created',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amountCents" INTEGER NOT NULL,
    "checkoutSessionId" TEXT,
    "paymentIntentId" TEXT,
    "paymentUrl" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "completedAt" DATETIME,
    "failureReason" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_outreachMessageId_fkey" FOREIGN KEY ("outreachMessageId") REFERENCES "OutreachMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT,
    "leadId" TEXT,
    "queueName" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "triggerSource" TEXT NOT NULL DEFAULT 'queue',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "input" TEXT,
    "output" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT,
    "leadId" TEXT,
    "agentRunId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "event" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "queueName" TEXT,
    "jobId" TEXT,
    "correlationId" TEXT,
    "message" TEXT,
    "payload" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_idempotencyKey_key" ON "Campaign"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Campaign_status_createdAt_idx" ON "Campaign"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Business_idempotencyKey_key" ON "Business"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Business_campaignId_normalizedDomain_idx" ON "Business"("campaignId", "normalizedDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Business_campaignId_normalizedName_key" ON "Business"("campaignId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Business_campaignId_externalSourceId_key" ON "Business"("campaignId", "externalSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_idempotencyKey_key" ON "Lead"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Lead_campaignId_status_score_idx" ON "Lead"("campaignId", "status", "score");

-- CreateIndex
CREATE INDEX "Lead_contactEmail_idx" ON "Lead"("contactEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_campaignId_businessId_key" ON "Lead"("campaignId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoSite_idempotencyKey_key" ON "DemoSite"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DemoSite_leadId_status_idx" ON "DemoSite"("leadId", "status");

-- CreateIndex
CREATE INDEX "DemoSite_campaignId_status_idx" ON "DemoSite"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DemoSite_leadId_deploymentId_key" ON "DemoSite"("leadId", "deploymentId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachMessage_providerMessageId_key" ON "OutreachMessage"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachMessage_idempotencyKey_key" ON "OutreachMessage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutreachMessage_leadId_status_sendAfter_idx" ON "OutreachMessage"("leadId", "status", "sendAfter");

-- CreateIndex
CREATE INDEX "OutreachMessage_campaignId_status_idx" ON "OutreachMessage"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_checkoutSessionId_key" ON "Payment"("checkoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentIntentId_key" ON "Payment"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_leadId_status_idx" ON "Payment"("leadId", "status");

-- CreateIndex
CREATE INDEX "Payment_campaignId_status_idx" ON "Payment"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_idempotencyKey_key" ON "AgentRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentRun_campaignId_status_startedAt_idx" ON "AgentRun"("campaignId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_leadId_status_startedAt_idx" ON "AgentRun"("leadId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_queueName_jobId_idx" ON "AgentRun"("queueName", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_runKey_attempt_key" ON "AgentRun"("runKey", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityLog_idempotencyKey_key" ON "ActivityLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ActivityLog_campaignId_occurredAt_idx" ON "ActivityLog"("campaignId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityLog_leadId_occurredAt_idx" ON "ActivityLog"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityLog_agentRunId_occurredAt_idx" ON "ActivityLog"("agentRunId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_occurredAt_idx" ON "ActivityLog"("entityType", "entityId", "occurredAt");

