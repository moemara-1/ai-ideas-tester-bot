import assert from "node:assert/strict";
import test from "node:test";
import { LeadLifecycleStates } from "@/lib/domain/states";
import { buildPipelineStages, countPipelineTotal } from "./pipeline";

test("buildPipelineStages fills missing lifecycle stages with zero", () => {
  const stages = buildPipelineStages({
    source_ingested: 2,
    outreach_sent: 5,
  });

  assert.equal(stages.length, LeadLifecycleStates.length);
  const sourceIngested = stages.find((stage) => stage.status === "source_ingested");
  const outreachSent = stages.find((stage) => stage.status === "outreach_sent");
  const disqualified = stages.find((stage) => stage.status === "disqualified");

  assert.equal(sourceIngested?.count, 2);
  assert.equal(outreachSent?.count, 5);
  assert.equal(disqualified?.count, 0);
});

test("countPipelineTotal sums all stage counts", () => {
  const stages = buildPipelineStages({
    discovered: 1,
    scored: 4,
    scheduled: 2,
  });

  assert.equal(countPipelineTotal(stages), 7);
});
