import assert from "node:assert/strict";
import test from "node:test";
import {
  partitionSynthesisWorkspace,
  synthesisWorkspaceActionLabel,
  synthesisWorkspaceDecisionSummary,
  synthesisWorkspaceNeedsDecision,
  synthesisWorkspacePhaseLabel,
} from "./synthesisWorkspace.js";

function thread(id, state, updatedAt) {
  return {
    id,
    title: id,
    objective: `Objective for ${id}`,
    updated_at: updatedAt || "2026-08-26T00:00:00Z",
    state: { required_grain: "asset × week", ...state },
  };
}

const evidence = [{ id: "source", dataset_id: "source", layer: "evidence", type: "source", label: "Held source" }];

const scope = thread("scope", {
  nodes: evidence,
  scope_block: { summary: "Input exceeds supported row limit" },
});

const join = thread("join", {
  nodes: evidence,
  join_candidates: [{
    usable: true,
    left_key: "asset_id",
    right_key: "asset_id",
    match_rate_pct: 42,
    matched: 42,
    left_distinct: 100,
    right_distinct: 48,
    right_duplicate_rows: 0,
  }],
});

const proposal = thread("proposal", {
  nodes: evidence,
  proposal: { id: "p1", title: "Reviewable construction" },
});

const previewRequired = thread("preview-required", {
  accepted_spec_hash: "sha256:spec-a",
  execution_spec: { input_dataset_id: "input-a", output_dataset_id: "output-a" },
  execution: { status: "spec_accepted" },
}, "2026-08-26T04:00:00Z");

const previewPassed = thread("preview-passed", {
  accepted_spec_hash: "sha256:spec-b",
  execution_spec: { input_dataset_id: "input-b", output_dataset_id: "output-b" },
  preview: {
    status: "succeeded",
    spec_hash: "sha256:spec-b",
    sampling: { previewed_rows: 5000 },
  },
  execution: { status: "spec_accepted" },
}, "2026-08-26T05:00:00Z");

const approval = thread("approval", {
  accepted_spec_hash: "sha256:spec-c",
  execution_spec: { input_dataset_id: "input-c", output_dataset_id: "output-c" },
  preview: { status: "succeeded", spec_hash: "sha256:spec-c" },
  execution: { status: "pending_approval" },
}, "2026-08-26T03:00:00Z");

const building = thread("building", {
  execution_spec: { input_dataset_id: "input-d", output_dataset_id: "output-d" },
  execution: { status: "running", job_id: "job-d" },
});

const awaitingRegistration = thread("awaiting-registration", {
  execution_spec: { input_dataset_id: "input-f", output_dataset_id: "output-f" },
  execution: { status: "completed", job_id: "job-f", output_dataset_id: "output-f" },
}, "2026-08-26T01:00:00Z");

const result = thread("result", {
  execution_spec: { input_dataset_id: "input-e", output_dataset_id: "output-e" },
  execution: { status: "query_ready", output_dataset_id: "output-e", manifest_id: "manifest-e" },
});
result.materialisation = "query_ready";

const activeEvidence = thread("evidence", { nodes: [] });

test("workspace promotes consequential researcher decisions instead of burying them in active work", () => {
  for (const item of [scope, join, proposal, previewRequired, previewPassed, approval]) {
    assert.equal(synthesisWorkspaceNeedsDecision(item), true, item.id);
  }
  assert.equal(synthesisWorkspaceNeedsDecision(building), false);
  assert.equal(synthesisWorkspaceNeedsDecision(awaitingRegistration), false);
  assert.equal(synthesisWorkspaceNeedsDecision(result), false);
  assert.equal(synthesisWorkspaceNeedsDecision(activeEvidence), false);

  const buckets = partitionSynthesisWorkspace([
    activeEvidence,
    building,
    awaitingRegistration,
    result,
    scope,
    join,
    proposal,
    previewRequired,
    previewPassed,
    approval,
  ]);

  assert.deepEqual(
    buckets.needsYou.map((item) => item.id),
    ["preview-passed", "preview-required", "approval", "scope", "join", "proposal"],
  );
  assert.deepEqual(buckets.active.map((item) => item.id), ["evidence"]);
  assert.deepEqual(buckets.building.map((item) => item.id), ["awaiting-registration", "building"]);
  assert.deepEqual(buckets.results.map((item) => item.id), ["result"]);
  assert.equal(buckets.continueThread.id, "preview-passed");
});

test("workspace resume labels describe the actual next researcher action", () => {
  assert.equal(synthesisWorkspacePhaseLabel(scope), "Scope decision needed");
  assert.equal(synthesisWorkspaceActionLabel(scope), "Resolve scope");
  assert.equal(synthesisWorkspaceActionLabel(join), "Resolve join");
  assert.equal(synthesisWorkspaceActionLabel(proposal), "Review proposal");
  assert.equal(synthesisWorkspacePhaseLabel(previewRequired), "Preview required");
  assert.equal(synthesisWorkspaceActionLabel(previewRequired), "Run Preview");
  assert.equal(synthesisWorkspacePhaseLabel(previewPassed), "Preview passed");
  assert.equal(synthesisWorkspaceActionLabel(previewPassed), "Review Preview");
  assert.equal(synthesisWorkspacePhaseLabel(approval), "Approval required");
  assert.equal(synthesisWorkspaceActionLabel(approval), "Review approval");
  assert.equal(synthesisWorkspacePhaseLabel(building), "Execution running");
  assert.equal(synthesisWorkspaceActionLabel(building), "View build");
  assert.equal(synthesisWorkspacePhaseLabel(awaitingRegistration), "Worker completed");
  assert.equal(synthesisWorkspaceActionLabel(awaitingRegistration), "View registration");
  assert.equal(synthesisWorkspacePhaseLabel(result), "Query-ready result");
  assert.equal(synthesisWorkspaceActionLabel(result), "Open result");
});

test("decision queue summaries surface the blocker instead of repeating project prose", () => {
  assert.equal(synthesisWorkspaceDecisionSummary(scope), "Input exceeds supported row limit");
  assert.match(synthesisWorkspaceDecisionSummary(join), /42% of the left-side entities match/);
  assert.match(synthesisWorkspaceDecisionSummary(previewPassed), /5,000 bounded input rows/);
  assert.equal(synthesisWorkspaceDecisionSummary(approval), "No worker is authorized to run until this approval is granted");
  assert.equal(synthesisWorkspaceDecisionSummary(building), "");
});
