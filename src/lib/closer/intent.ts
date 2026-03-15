const POSITIVE_TERMS = [
  "pricing",
  "buy",
  "purchase",
  "payment",
  "contract",
  "invoice",
  "send link",
  "ready",
  "move forward",
  "interested",
] as const;

const NEGATIVE_TERMS = [
  "not interested",
  "stop",
  "unsubscribe",
  "remove me",
  "no thanks",
  "wrong person",
  "do not contact",
] as const;

const MEETING_TERMS = [
  "meeting",
  "call",
  "schedule",
  "book time",
  "calendar",
] as const;

export type ReplyIntent = "buying_intent" | "meeting_request" | "not_interested" | "neutral";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export function detectReplyIntent(replyText: string | null | undefined): ReplyIntent {
  if (!replyText) {
    return "neutral";
  }

  const normalized = normalize(replyText);

  if (!normalized) {
    return "neutral";
  }

  if (containsAny(normalized, NEGATIVE_TERMS)) {
    return "not_interested";
  }

  if (containsAny(normalized, POSITIVE_TERMS)) {
    return "buying_intent";
  }

  if (containsAny(normalized, MEETING_TERMS)) {
    return "meeting_request";
  }

  return "neutral";
}
