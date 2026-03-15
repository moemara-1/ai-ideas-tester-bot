import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { recordSchedulerFallback } from "./scheduler";
import {
  WebhookPayloadError,
  verifyStripeSignature,
} from "./signature";

type StripeEvent = {
  id?: string;
  type: string;
  data?: {
    object?: {
      id?: string;
      payment_intent?: string;
      metadata?: {
        paymentId?: string;
        leadId?: string;
      };
    };
  };
};

export type StripeWebhookResult = {
  eventId: string;
  replayed: boolean;
  handled: boolean;
  action: "duplicate_ignored" | "ignored" | "payment_succeeded" | "payment_failed" | "unmatched_payment";
  paymentId?: string;
  leadId?: string;
};

function parseEvent(rawBody: string): StripeEvent {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new WebhookPayloadError("Stripe webhook payload is not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new WebhookPayloadError("Stripe webhook payload must be an object.");
  }

  const event = parsed as Partial<StripeEvent>;
  if (!event.type || typeof event.type !== "string") {
    throw new WebhookPayloadError("Stripe webhook payload is missing event type.");
  }

  return event as StripeEvent;
}

function toDeterministicEventId(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function shouldMarkSucceeded(type: string): boolean {
  return type === "checkout.session.completed" || type === "payment_intent.succeeded";
}

function shouldMarkFailed(type: string): boolean {
  return (
    type === "checkout.session.expired" ||
    type === "checkout.session.async_payment_failed" ||
    type === "payment_intent.payment_failed"
  );
}

async function findPayment(event: StripeEvent) {
  const object = event.data?.object;
  if (!object) {
    return null;
  }

  const metadataPaymentId = object.metadata?.paymentId?.trim();
  if (metadataPaymentId) {
    const byId = await prisma.payment.findUnique({
      where: {
        id: metadataPaymentId,
      },
    });

    if (byId) {
      return byId;
    }
  }

  const checkoutSessionId = object.id?.trim();
  if (checkoutSessionId && event.type.startsWith("checkout.session")) {
    const bySession = await prisma.payment.findUnique({
      where: {
        checkoutSessionId,
      },
    });

    if (bySession) {
      return bySession;
    }
  }

  const paymentIntentId = object.payment_intent?.trim() || object.id?.trim();
  if (paymentIntentId && event.type.startsWith("payment_intent")) {
    const byIntent = await prisma.payment.findUnique({
      where: {
        paymentIntentId,
      },
    });

    if (byIntent) {
      return byIntent;
    }
  }

  return null;
}

export async function processStripeWebhook(params: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}): Promise<StripeWebhookResult> {
  verifyStripeSignature({
    rawBody: params.rawBody,
    signatureHeader: params.signatureHeader,
    secret: params.secret,
  });

  const event = parseEvent(params.rawBody);
  const eventId = event.id?.trim() || toDeterministicEventId(params.rawBody);
  const webhookLogKey = `webhook:stripe:${eventId}`;

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

  const payment = await findPayment(event);

  if (!payment) {
    await prisma.activityLog.create({
      data: {
        entityType: "system",
        event: "webhook.stripe.unmatched",
        level: "warn",
        queueName: "lead.closer",
        correlationId: webhookLogKey,
        message: "Stripe webhook could not match a payment record.",
        payload: JSON.stringify({
          type: event.type,
        }),
        idempotencyKey: webhookLogKey,
      },
    });

    return {
      eventId,
      replayed: false,
      handled: false,
      action: "unmatched_payment",
    };
  }

  if (!shouldMarkSucceeded(event.type) && !shouldMarkFailed(event.type)) {
    await prisma.activityLog.create({
      data: {
        campaignId: payment.campaignId,
        leadId: payment.leadId,
        entityType: "payment",
        entityId: payment.id,
        event: "webhook.stripe.ignored",
        level: "info",
        queueName: "lead.closer",
        jobId: payment.id,
        correlationId: webhookLogKey,
        message: "Stripe webhook event ignored.",
        payload: JSON.stringify({
          type: event.type,
        }),
        idempotencyKey: webhookLogKey,
      },
    });

    return {
      eventId,
      replayed: false,
      handled: false,
      action: "ignored",
      paymentId: payment.id,
      leadId: payment.leadId,
    };
  }

  if (shouldMarkSucceeded(event.type)) {
    const completedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: "succeeded",
          completedAt,
          paymentIntentId: event.data?.object?.payment_intent ?? payment.paymentIntentId,
          checkoutSessionId: event.data?.object?.id ?? payment.checkoutSessionId,
        },
      });

      await tx.lead.update({
        where: {
          id: payment.leadId,
        },
        data: {
          status: "payment_completed",
        },
      });

      await recordSchedulerFallback({
        tx,
        campaignId: payment.campaignId,
        leadId: payment.leadId,
        reason: "calendar_not_configured",
      });

      await tx.activityLog.create({
        data: {
          campaignId: payment.campaignId,
          leadId: payment.leadId,
          entityType: "payment",
          entityId: payment.id,
          event: "payment.checkout.completed",
          level: "info",
          queueName: "lead.closer",
          jobId: payment.id,
          correlationId: webhookLogKey,
          message: "Stripe checkout completion webhook processed.",
          payload: JSON.stringify({
            type: event.type,
            paymentId: payment.id,
          }),
          idempotencyKey: webhookLogKey,
        },
      });
    });

    return {
      eventId,
      replayed: false,
      handled: true,
      action: "payment_succeeded",
      paymentId: payment.id,
      leadId: payment.leadId,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: "failed",
        failureReason: event.type,
      },
    });

    await tx.activityLog.create({
      data: {
        campaignId: payment.campaignId,
        leadId: payment.leadId,
        entityType: "payment",
        entityId: payment.id,
        event: "payment.checkout.failed",
        level: "warn",
        queueName: "lead.closer",
        jobId: payment.id,
        correlationId: webhookLogKey,
        message: "Stripe payment failure webhook processed.",
        payload: JSON.stringify({
          type: event.type,
          paymentId: payment.id,
        }),
        idempotencyKey: webhookLogKey,
      },
    });
  });

  return {
    eventId,
    replayed: false,
    handled: true,
    action: "payment_failed",
    paymentId: payment.id,
    leadId: payment.leadId,
  };
}
