import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env/server-env";
import { processStripeWebhook } from "@/lib/webhooks/stripe";
import { WebhookPayloadError, WebhookSignatureError } from "@/lib/webhooks/signature";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const env = getServerEnv();
  const rawBody = await request.text();

  try {
    const result = await processStripeWebhook({
      rawBody,
      signatureHeader: request.headers.get("stripe-signature"),
      secret: env.STRIPE_WEBHOOK_SECRET,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        {
          status: 401,
        }
      );
    }

    if (error instanceof WebhookPayloadError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        {
          status: 400,
        }
      );
    }

    throw error;
  }
}
