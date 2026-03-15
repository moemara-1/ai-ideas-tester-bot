import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionLeadLifecycleState,
  isAgentRunState,
  isLeadLifecycleState,
  isTerminalAgentRunState,
} from "./states";

test("recognizes valid lead lifecycle state values", () => {
  assert.equal(isLeadLifecycleState("source_ingested"), true);
  assert.equal(isLeadLifecycleState("scheduled"), true);
  assert.equal(isLeadLifecycleState("unknown"), false);
});

test("enforces lead lifecycle transitions", () => {
  assert.equal(canTransitionLeadLifecycleState("source_ingested", "signal_scored"), true);
  assert.equal(canTransitionLeadLifecycleState("outreach_sent", "payment_pending"), true);
  assert.equal(canTransitionLeadLifecycleState("scheduled", "qualified"), false);
});

test("tracks run state shape and terminal behavior", () => {
  assert.equal(isAgentRunState("started"), true);
  assert.equal(isAgentRunState("completed"), true);
  assert.equal(isAgentRunState("queued"), false);
  assert.equal(isTerminalAgentRunState("completed"), true);
  assert.equal(isTerminalAgentRunState("failed"), true);
  assert.equal(isTerminalAgentRunState("started"), false);
});
