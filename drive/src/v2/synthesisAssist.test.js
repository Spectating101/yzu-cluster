import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { synthesisAssist } from "./synthesisAssist.js";

function thread(state = {}, materialisation = "not_materialised") {
  return {
    id: "thread-test",
    title: "Test construction",
    objective: "Construct a defensible test research asset.",
    materialisation,
    state: {
      title: "Test construction",
      objective: "Construct a defensible test research asset.",
      ...state,
    },
  };
}

describe("synthesisAssist canonical research state", () => {
  it("preserves measured evidence risk instead of replacing it with generic AI language", () => {
    const assist = synthesisAssist(thread({
      nodes: [
        { id: "a", type: "source", layer: "evidence", dataset_id: "a" },
        { id: "b", type: "source", layer: "evidence", dataset_id: "b" },
      ],
      column_profiles: [
        { dataset_id: "a", column: "attention", flags: [] },
        { dataset_id: "b", column: "posts", flags: ["sparse"] },
      ],
    }));

    assert.equal(assist.status, "Evidence measured");
    assert.match(assist.decision, /Review measured evidence/);
    assert.equal(assist.risk, "1 sparse / flagged column");
    assert.match(assist.next, /Request one reviewable construction/);
  });

  it("keeps a recommendation explicitly in researcher review", () => {
    const assist = synthesisAssist(thread({
      constructions: [{
        recommended: true,
        title: "Composite signal",
        nodes: [{ id: "held", source: "Held evidence" }],
      }],
    }));

    assert.equal(assist.status, "Construction recommended");
    assert.match(assist.decision, /Review the recommendation/);
    assert.match(assist.risk, /proxy design/);
  });

  it("treats partial join coverage as a population decision even without duplicates", () => {
    const assist = synthesisAssist(thread({
      nodes: [{ id: "a", type: "source", layer: "evidence", dataset_id: "a" }],
      join_candidates: [{
        left_key: "asset_id",
        right_key: "asset_id",
        matched: 50,
        left_distinct: 100,
        right_distinct: 70,
        match_rate_pct: 50,
        right_duplicate_rows: 0,
        usable: true,
      }],
    }));

    assert.equal(assist.label, "Join decision");
    assert.match(assist.risk, /50%/);
    assert.ok(assist.prompts.some((prompt) => /unmatched population/i.test(prompt)));
  });

  it("distinguishes Preview passed from approval and states bounded authority", () => {
    const assist = synthesisAssist(thread({
      execution_spec: {
        input_dataset_id: "input",
        output_dataset_id: "synthesis_output",
        metrics: [{ function: "count", as: "n" }],
      },
      accepted_spec_hash: "sha256:current",
      execution: { status: "spec_accepted", output_dataset_id: "synthesis_output" },
      preview: {
        status: "succeeded",
        spec_hash: "sha256:current",
        sampling: { previewed_rows: 250 },
      },
    }));

    assert.equal(assist.label, "Preview passed");
    assert.equal(assist.decisionKind, "review_preview");
    assert.match(assist.risk, /250 bounded input rows/);
    assert.match(assist.risk, /not the full population/);
    assert.ok(assist.prompts.some((prompt) => /fail to cover/i.test(prompt)));
  });

  it("treats a stale Preview as requiring a rerun rather than approval", () => {
    const assist = synthesisAssist(thread({
      execution_spec: {
        input_dataset_id: "input",
        output_dataset_id: "synthesis_output",
        metrics: [{ function: "count", as: "n" }],
      },
      accepted_spec_hash: "sha256:new",
      execution: { status: "spec_accepted" },
      preview: { status: "succeeded", spec_hash: "sha256:old" },
    }));

    assert.equal(assist.label, "Preview stale");
    assert.equal(assist.decisionKind, "run_preview");
    assert.match(assist.decision, /Rerun Preview/);
    assert.match(assist.risk, /older method or input revision/);
  });

  it("keeps pending approval as an explicit researcher authorization boundary", () => {
    const assist = synthesisAssist(thread({
      execution_spec: { input_dataset_id: "input", output_dataset_id: "synthesis_output" },
      execution: { status: "pending_approval", job_id: "job-1" },
    }));

    assert.equal(assist.label, "Execution approval");
    assert.equal(assist.status, "Approval required");
    assert.match(assist.risk, /No worker is authorized/);
    assert.ok(assist.prompts.some((prompt) => /exactly what I would authorize/i.test(prompt)));
  });

  it("does not upgrade worker completion to a registered result", () => {
    const assist = synthesisAssist(thread({
      execution_spec: { input_dataset_id: "input", output_dataset_id: "synthesis_output" },
      execution: { status: "completed", job_id: "job-1", output_dataset_id: "synthesis_output" },
    }));

    assert.equal(assist.label, "Build completed");
    assert.equal(assist.status, "Worker completed");
    assert.match(assist.risk, /not registration or query readiness/);
  });

  it("marks only durable query-ready evidence as a query-ready result", () => {
    const assist = synthesisAssist(thread({
      execution_spec: { input_dataset_id: "input", output_dataset_id: "synthesis_output" },
      execution: { status: "query_ready", output_dataset_id: "synthesis_output" },
    }, "query_ready"));

    assert.equal(assist.label, "Query-ready result");
    assert.equal(assist.status, "Query-ready output");
    assert.match(assist.risk, /inherit/);
  });
});
