import test from "node:test";
import assert from "node:assert/strict";
import { historyLifecycleLabel } from "./historyLifecycleLabel.js";

test("cancelled list and rail share Cancelled, not Route investigating", () => {
  assert.equal(
    historyLifecycleLabel({ status: "cancelled", action: "collection_run", target: "USDT" }),
    "Cancelled",
  );
});

test("frozen lifecycle labels require an explicit recorded stage", () => {
  assert.equal(historyLifecycleLabel({ meta: { lifecycle_stage: "method_review" } }), "Method review");
  assert.equal(historyLifecycleLabel({ meta: { lifecycle_stage: "extracting" } }), "Extracting");
  assert.equal(historyLifecycleLabel({ meta: { lifecycle_stage: "schema_review" } }), "Schema review");
  assert.equal(historyLifecycleLabel({ target: "Thin record", meta: {} }), "Status not reported");
});

test("failed recovery vocabulary is shared", () => {
  assert.equal(
    historyLifecycleLabel({ status: "failed", action: "collection_run" }),
    "Failed — needs recovery",
  );
});
