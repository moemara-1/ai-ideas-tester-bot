import { createHmac, timingSafeEqual } from "node:crypto";

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

export class WebhookPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookPayloadError";
  }
}

function toBuffer(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = toBuffer(left);
  const rightBuffer = toBuffer(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function hmacSha256(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyResendSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}): void {
  const signatureHeader = params.signatureHeader?.trim();

  if (!signatureHeader) {
    throw new WebhookSignatureError("Missing x-resend-signature header.");
  }

  const provided = signatureHeader.replace(/^sha256=/, "");
  const expected = hmacSha256(params.secret, params.rawBody);

  if (!safeEqual(provided, expected)) {
    throw new WebhookSignatureError("Invalid Resend webhook signature.");
  }
}

function parseStripeSignatureHeader(value: string): { timestamp: string; signature: string } {
  const parts = value.split(",").map((entry) => entry.trim());
  const attributes = Object.fromEntries(
    parts
      .map((part) => part.split("="))
      .filter(([key, token]) => Boolean(key) && Boolean(token))
  );

  const timestamp = attributes.t;
  const signature = attributes.v1;

  if (!timestamp || !signature) {
    throw new WebhookSignatureError("Invalid Stripe signature header format.");
  }

  return {
    timestamp,
    signature,
  };
}

export function verifyStripeSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  toleranceSeconds?: number;
  nowUnixMs?: number;
}): void {
  const signatureHeader = params.signatureHeader?.trim();

  if (!signatureHeader) {
    throw new WebhookSignatureError("Missing stripe-signature header.");
  }

  const { timestamp, signature } = parseStripeSignatureHeader(signatureHeader);
  const signedPayload = `${timestamp}.${params.rawBody}`;
  const expected = hmacSha256(params.secret, signedPayload);

  if (!safeEqual(signature, expected)) {
    throw new WebhookSignatureError("Invalid Stripe webhook signature.");
  }

  const nowUnixMs = params.nowUnixMs ?? Date.now();
  const toleranceSeconds = params.toleranceSeconds ?? 300;
  const timestampMs = Number(timestamp) * 1000;

  if (!Number.isFinite(timestampMs)) {
    throw new WebhookSignatureError("Invalid Stripe signature timestamp.");
  }

  const ageSeconds = Math.abs(nowUnixMs - timestampMs) / 1000;
  if (ageSeconds > toleranceSeconds) {
    throw new WebhookSignatureError("Stripe webhook signature timestamp outside tolerance.");
  }
}

export function signResendPayload(secret: string, rawBody: string): string {
  return hmacSha256(secret, rawBody);
}

export function signStripePayload(secret: string, rawBody: string, timestamp: number): string {
  return hmacSha256(secret, `${timestamp}.${rawBody}`);
}
