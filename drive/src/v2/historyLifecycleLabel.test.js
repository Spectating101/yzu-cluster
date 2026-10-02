import test from "node:test";
import assert from "node:assert/strict";
import { historyEvidenceLabel, historyEventLabel, historyExecutionModeLabel, historyLifecycleInternalLabel, historyLifecycleLabel } from "./historyLifecycleLabel.js";

test("cancelled list and rail share Cancelled, not Route investigating", () => {
  assert.equal(
    historyLifecycleLabel({ status: "cancelled", action: "collection_run", target: "USDT" }),
    "Cancelled",
  );
});

test("frozen lifecycle labels require an explicit recorded stage", () => {
  assert.equal(historyLifecycleLabel({ meta: { lifecycle_stage: "method_review" } }), "Method review");
  assert.equal(historyLifecycleLabel({ meta: { lifecycle_stage: "extracting" } }), "Extracting");
  assert.equal(historyLifecycleLabel({ meta: { lifecycle_stage: "schema_review" } }), "Review dataset fields");
  assert.equal(historyLifecycleLabel({ target: "Thin record", meta: {} }), "Status not reported");
});

test("failed recovery vocabulary is shared", () => {
  assert.equal(
    historyLifecycleLabel({ status: "failed", action: "collection_run" }),
    "Failed — needs attention",
  );
});


test("last step labels map backend event kinds without changing the record", () => {
  const event = Object.freeze({ kind: "intent", status: "pending_approval" });
  assert.equal(historyEventLabel(event.kind), "Request");
  assert.equal(historyEventLabel("collection_run"), "Collection");
  assert.equal(historyEventLabel("registered_asset"), "Saved to Library");
  assert.equal(historyEventLabel("recorded_event"), "Last step");
  assert.equal(historyEventLabel("new_internal_event"), "Request update");
  assert.equal(event.kind, "intent");
  assert.equal(historyLifecycleInternalLabel(event), "Approval required");
  assert.equal(historyLifecycleLabel(event), "Waiting for your approval");
});

test("unrecognized statuses remain honest and execution modes describe behavior", () => {
  assert.equal(historyLifecycleLabel({ status: "future_status" }), "Status not described");
  assert.equal(historyLifecycleLabel({ status: "route_selected" }), "Collection method selected");
  assert.equal(historyLifecycleLabel({ meta: { lifecycle_stage: "route_review" } }), "Finding a collection method");
  assert.equal(historyExecutionModeLabel("non_executing"), "Recorded only · does not run automatically");
  assert.equal(historyExecutionModeLabel("future_mode"), "Execution mode not described");
});


test("evidence summaries label generated source and status fields without changing backend prose", () => {
  assert.equal(historyEvidenceLabel("Collection route · completed"), "Collection method · Collection complete");
  assert.equal(historyEvidenceLabel("Discover request · running"), "Discover request · Collecting");
  assert.equal(historyEvidenceLabel("Recorded event"), "Last step");
  assert.equal(historyEvidenceLabel("Dataset could not be read"), "Dataset could not be read");
});
