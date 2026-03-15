import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLimit, queueNameFromDlqName } from "./dlq-admin";

test("normalizeLimit clamps invalid and out-of-range values", () => {
  assert.equal(normalizeLimit(undefined), 25);
  assert.equal(normalizeLimit(Number.NaN), 25);
  assert.equal(normalizeLimit(0), 1);
  assert.equal(normalizeLimit(250), 200);
  assert.equal(normalizeLimit(17), 17);
});

test("queueNameFromDlqName maps known DLQ names back to source queue", () => {
  assert.equal(queueNameFromDlqName("dlq.campaign.scout"), "campaign.scout");
  assert.equal(queueNameFromDlqName("dlq.lead.scheduler"), "lead.scheduler");
});
