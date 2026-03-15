import assert from "node:assert/strict";
import test from "node:test";
import type { Job } from "bullmq";
import { hasExhaustedRetries, routeToDlq } from "./dlq";
import { QueueNames, toDlqQueueName } from "./queue-names";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    name: "scout.run",
    queueName: QueueNames.CampaignScout,
    attemptsMade: 1,
    data: { leadId: "lead-1" },
    opts: { attempts: 3 },
    ...overrides,
  } as Job;
}

test("hasExhaustedRetries returns false before final attempt", () => {
  const job = makeJob({ attemptsMade: 2, opts: { attempts: 3 } as Job["opts"] });
  assert.equal(hasExhaustedRetries(job), false);
});

test("hasExhaustedRetries returns true after final attempt", () => {
  const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } as Job["opts"] });
  assert.equal(hasExhaustedRetries(job), true);
});

test("routeToDlq adds dead-letter payload with deterministic id", async () => {
  const addedCalls: Array<{ name: string; data: unknown; opts?: { jobId?: string } }> = [];

  const dlqQueue = {
    add: async (name: string, data: unknown, opts?: { jobId?: string }) => {
      addedCalls.push({ name, data, opts });
      return { id: opts?.jobId };
    },
  };

  const queueName = QueueNames.CampaignScout;
  const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } as Job["opts"] });
  const error = new Error("simulated failure");

  const result = await routeToDlq({
    queueName,
    job,
    error,
    dlqQueues: {
      [toDlqQueueName(queueName)]: dlqQueue,
    },
  });

  assert.equal(result.dlqQueueName, "dlq.campaign.scout");
  assert.equal(result.dlqJobId, "campaign.scout:job-1");
  assert.equal(addedCalls.length, 1);
  assert.equal(addedCalls[0]?.name, "dead-letter");
  assert.equal(addedCalls[0]?.opts?.jobId, "campaign.scout:job-1");

  const payload = addedCalls[0]?.data as {
    sourceQueue: string;
    sourceJobId: string;
    errorMessage: string;
    sourceMaxAttempts: number;
  };

  assert.equal(payload.sourceQueue, "campaign.scout");
  assert.equal(payload.sourceJobId, "job-1");
  assert.equal(payload.errorMessage, "simulated failure");
  assert.equal(payload.sourceMaxAttempts, 3);
});
