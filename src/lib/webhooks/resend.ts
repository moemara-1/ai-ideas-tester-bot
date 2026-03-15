import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { detectReplyIntent, type ReplyIntent } from "@/lib/closer/intent";
import { recordSchedulerFallback } from "./scheduler";
import {
  WebhookPayloadError,
  verifyResendSignature,
} from "./signature";

type ResendWebhookEvent = {
  id?: string;
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    message_id?: string;
    text?: string;
    html?: string;
    bounce?: {
      reason?: string;
    };
    reply?: {
      text?: string;
      html?: string;
    };
  };
};

export type ResendWebhookResult = {
  eventId: string;
  replayed: boolean;
  handled: boolean;
  action:
    | "duplicate_ignored"
    | "ignored"
    | "unmatched_message"
    | "lead_marked_replied"
    | "lead_disqualified"
    | "payment_link_issued";
  leadId?: string;
  paymentId?: string;
};

function parseEvent(rawBody: string): ResendWebhookEvent {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new WebhookPayloadError("Resend webhook payload is not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new WebhookPayloadError("Resend webhook payload must be an object.");
  }

  const event = parsed as Partial<ResendWebhookEvent>;
  if (!event.type || typeof event.type !== "string") {
    throw new WebhookPayloadError("Resend webhook payload is missing event type.");
  }

  return event as ResendWebhookEvent;
}

function toDeterministicEventId(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function extractMessageId(event: ResendWebhookEvent): string | null {
  const data = event.data;
  if (!data) {
    return null;
  }

  return data.email_id?.trim() || data.message_id?.trim() || null;
}

function extractReplyText(event: ResendWebhookEvent): string | null {
  const data = event.data;
  if (!data) {
    return null;
  }

  return data.reply?.text?.trim() || data.text?.trim() || null;
}

function isReplyEvent(type: string): boolean {
  return type === "email.replied" || type.endsWith(".replied");
}

function isBounceEvent(type: string): boolean {
  return type === "email.bounced" || type.endsWith(".bounced");
}

function paymentLinkForLead(leadId: string): { checkoutSessionId: string; paymentUrl: string } {
  const checkoutSessionId = `mock_session_${leadId}`;

  return {
    checkoutSessionId,
    paymentUrl: `https://checkout.stripe.com/pay/${checkoutSessionId}`,
  };
}

async function recordWebhookLog(params: {
  idempotencyKey: string;
  campaignId?: string;
  leadId?: string;
  event: string;
  level: "info" | "warn" | "error";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await prisma.activityLog.create({
    data: {
      campaignId: params.campaignId,
      leadId: params.leadId,
      entityType: params.leadId ? "lead" : "system",
      entityId: params.leadId,
      event: params.event,
      level: params.level,
      queueName: "lead.closer",
      jobId: params.leadId,
      correlationId: params.idempotencyKey,
      message: params.message,
      payload: JSON.stringify(params.payload),
      idempotencyKey: params.idempotencyKey,
    },
  });
}

async function applyReplyIntent(params: {
  outreachMessageId: string;
  leadId: string;
  campaignId: string;
  replyText: string | null;
  eventId: string;
}): Promise<Pick<ResendWebhookResult, "action" | "leadId" | "paymentId">> {
  const intent = detectReplyIntent(params.replyText);

  if (intent === "not_interested") {
    await prisma.lead.update({
      where: {
        id: params.leadId,
      },
      data: {
        status: "disqualified",
      },
    });

    await recordWebhookLog({
      idempotencyKey: `closer:intent:${params.eventId}`,
      campaignId: params.campaignId,
      leadId: params.leadId,
      event: "lead.closer.intent.disqualified",
      level: "info",
      message: "Reply intent marked lead as disqualified.",
      payload: {
        intent,
      },
    });

    return {
      action: "lead_disqualified",
      leadId: params.leadId,
    };
  }

  if (intent === "buying_intent" || intent === "meeting_request") {
    const paymentKey = `payment:closer:${params.leadId}`;
    const paymentLink = paymentLinkForLead(params.leadId);

    await prisma.lead.update({
      where: {
        id: params.leadId,
      },
      data: {
        status: "payment_pending",
      },
    });

    const payment = await prisma.payment.upsert({
      where: {
        idempotencyKey: paymentKey,
      },
      update: {
        outreachMessageId: params.outreachMessageId,
        status: "checkout_pending",
        checkoutSessionId: paymentLink.checkoutSessionId,
        paymentUrl: paymentLink.paymentUrl,
      },
      create: {
        campaignId: params.campaignId,
        leadId: params.leadId,
        outreachMessageId: params.outreachMessageId,
        provider: "stripe",
        status: "checkout_pending",
        currency: "USD",
        amountCents: 4900,
        checkoutSessionId: paymentLink.checkoutSessionId,
        paymentUrl: paymentLink.paymentUrl,
        idempotencyKey: paymentKey,
      },
    });

    await prisma.activityLog.upsert({
      where: {
        idempotencyKey: `closer:payment-link:${params.leadId}`,
      },
      update: {
        campaignId: params.campaignId,
        leadId: params.leadId,
        entityType: "lead",
        entityId: params.leadId,
        event: "lead.closer.payment_link_issued",
        level: "info",
        queueName: "lead.closer",
        jobId: params.leadId,
        correlationId: `lead.closer:${params.leadId}`,
        message: "Payment link issued after positive reply intent.",
        payload: JSON.stringify({
          intent,
          paymentId: payment.id,
          paymentUrl: payment.paymentUrl,
        }),
      },
      create: {
        campaignId: params.campaignId,
        leadId: params.leadId,
        entityType: "lead",
        entityId: params.leadId,
        event: "lead.closer.payment_link_issued",
        level: "info",
        queueName: "lead.closer",
        jobId: params.leadId,
        correlationId: `lead.closer:${params.leadId}`,
        message: "Payment link issued after positive reply intent.",
        payload: JSON.stringify({
          intent,
          paymentId: payment.id,
          paymentUrl: payment.paymentUrl,
        }),
        idempotencyKey: `closer:payment-link:${params.leadId}`,
      },
    });

    await prisma.$transaction(async (tx) => {
      await recordSchedulerFallback({
        tx,
        campaignId: params.campaignId,
        leadId: params.leadId,
        reason: "calendar_not_configured",
      });
    });

    return {
      action: "payment_link_issued",
      leadId: params.leadId,
      paymentId: payment.id,
    };
  }

  await prisma.lead.update({
    where: {
      id: params.leadId,
    },
    data: {
      status: "replied",
    },
  });

  await recordWebhookLog({
    idempotencyKey: `closer:intent:${params.eventId}`,
    campaignId: params.campaignId,
    leadId: params.leadId,
    event: "lead.closer.intent.replied",
    level: "info",
    message: "Reply intent recorded as neutral.",
    payload: {
      intent,
    },
  });

  return {
    action: "lead_marked_replied",
    leadId: params.leadId,
  };
}

export async function processResendWebhook(params: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}): Promise<ResendWebhookResult> {
  verifyResendSignature({
    rawBody: params.rawBody,
    signatureHeader: params.signatureHeader,
    secret: params.secret,
  });

  const event = parseEvent(params.rawBody);
  const eventId = event.id?.trim() || toDeterministicEventId(params.rawBody);
  const webhookLogKey = `webhook:resend:${eventId}`;

  const replay = await prisma.activityLog.findUnique({
    where: {
      idempotencyKey: webhookLogKey,
    },
    select: {
      id: true,
    },
  });

  if (replay) {
    return {
      eventId,
      replayed: true,
      handled: false,
      action: "duplicate_ignored",
    };
  }

  const messageId = extractMessageId(event);

  if (!messageId) {
    await recordWebhookLog({
      idempotencyKey: webhookLogKey,
      event: "webhook.resend.ignored",
      level: "warn",
      message: "Resend webhook ignored due to missing message identifier.",
      payload: {
        type: event.type,
      },
    });

    return {
      eventId,
      replayed: false,
      handled: false,
      action: "ignored",
    };
  }

  const outreach = await prisma.outreachMessage.findUnique({
    where: {
      providerMessageId: messageId,
    },
    select: {
      id: true,
      campaignId: true,
      leadId: true,
      status: true,
    },
  });

  if (!outreach) {
    await recordWebhookLog({
      idempotencyKey: webhookLogKey,
      event: "webhook.resend.unmatched",
      level: "warn",
      message: "Resend webhook message ID does not match known outreach message.",
      payload: {
        type: event.type,
        messageId,
      },
    });

    return {
      eventId,
      replayed: false,
      handled: false,
      action: "unmatched_message",
    };
  }

  if (isBounceEvent(event.type)) {
    await prisma.$transaction(async (tx) => {
      await tx.outreachMessage.update({
        where: {
          id: outreach.id,
        },
        data: {
          status: "bounced",
          bouncedAt: new Date(),
          failureReason: event.data?.bounce?.reason?.slice(0, 300) ?? "bounce",
        },
      });

      await tx.lead.update({
        where: {
          id: outreach.leadId,
        },
        data: {
          status: "disqualified",
        },
      });

      await tx.activityLog.create({
        data: {
          campaignId: outreach.campaignId,
          leadId: outreach.leadId,
          entityType: "lead",
          entityId: outreach.leadId,
          event: "webhook.resend.bounced",
          level: "warn",
          queueName: "lead.closer",
          jobId: outreach.leadId,
          correlationId: webhookLogKey,
          message: "Resend bounce webhook processed.",
          payload: JSON.stringify({
            type: event.type,
            messageId,
          }),
          idempotencyKey: webhookLogKey,
        },
      });
    });

    return {
      eventId,
      replayed: false,
      handled: true,
      action: "lead_disqualified",
      leadId: outreach.leadId,
    };
  }

  if (!isReplyEvent(event.type)) {
    await recordWebhookLog({
      idempotencyKey: webhookLogKey,
      campaignId: outreach.campaignId,
      leadId: outreach.leadId,
      event: "webhook.resend.ignored",
      level: "info",
      message: "Resend webhook event is currently ignored.",
      payload: {
        type: event.type,
        messageId,
      },
    });

    return {
      eventId,
      replayed: false,
      handled: false,
      action: "ignored",
      leadId: outreach.leadId,
    };
  }

  await prisma.outreachMessage.update({
    where: {
      id: outreach.id,
    },
    data: {
      status: "replied",
      repliedAt: new Date(),
    },
  });

  const intentResult = await applyReplyIntent({
    outreachMessageId: outreach.id,
    leadId: outreach.leadId,
    campaignId: outreach.campaignId,
    replyText: extractReplyText(event),
    eventId,
  });

  await recordWebhookLog({
    idempotencyKey: webhookLogKey,
    campaignId: outreach.campaignId,
    leadId: outreach.leadId,
    event: "webhook.resend.replied",
    level: "info",
    message: "Resend reply webhook processed.",
    payload: {
      type: event.type,
      action: intentResult.action,
      messageId,
    },
  });

  return {
    eventId,
    replayed: false,
    handled: true,
    action: intentResult.action,
    leadId: intentResult.leadId,
    paymentId: intentResult.paymentId,
  };
}
