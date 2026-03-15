import assert from "node:assert/strict";
import test from "node:test";
import {
  FreeModelViolationError,
  assertFreeOpenRouterModelAllowed,
  isFreeOpenRouterModelAllowed,
} from "./free-model-gate";

const allowlist = [
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3-8b-instruct:free",
];

test("passes for free model in allowlist", () => {
  assert.equal(
    isFreeOpenRouterModelAllowed("google/gemini-2.0-flash-exp:free", allowlist),
    true
  );

  assert.doesNotThrow(() => {
    assertFreeOpenRouterModelAllowed("google/gemini-2.0-flash-exp:free", allowlist);
  });
});

test("rejects allowlisted model that is not free", () => {
  assert.equal(isFreeOpenRouterModelAllowed("google/gemini-2.0-flash-exp", allowlist), false);

  assert.throws(() => {
    assertFreeOpenRouterModelAllowed("google/gemini-2.0-flash-exp", allowlist);
  }, FreeModelViolationError);
});

test("rejects free model missing from allowlist", () => {
  assert.equal(isFreeOpenRouterModelAllowed("deepseek/deepseek-chat:free", allowlist), false);

  assert.throws(() => {
    assertFreeOpenRouterModelAllowed("deepseek/deepseek-chat:free", allowlist);
  }, FreeModelViolationError);
});
