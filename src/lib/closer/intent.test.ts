import assert from "node:assert/strict";
import test from "node:test";
import { detectReplyIntent } from "./intent";

test("detectReplyIntent recognizes buying intent", () => {
  assert.equal(detectReplyIntent("Looks great, send payment link and pricing"), "buying_intent");
});

test("detectReplyIntent recognizes negative intent", () => {
  assert.equal(detectReplyIntent("Please unsubscribe and remove me"), "not_interested");
});

test("detectReplyIntent recognizes meeting request", () => {
  assert.equal(detectReplyIntent("Can we schedule a call next week?"), "meeting_request");
});

test("detectReplyIntent defaults to neutral", () => {
  assert.equal(detectReplyIntent("Thanks for sharing"), "neutral");
  assert.equal(detectReplyIntent(""), "neutral");
});
