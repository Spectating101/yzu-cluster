import test from "node:test";
import assert from "node:assert/strict";
import { methodGraph, partDetail } from "./synthesisMethodGraph.js";

const built = {
  title: "Stablecoin attention weekly panel",
  state: {
    required_grain: "asset × week",
    nodes: [{ id: "trust", dataset_id: "trust", type: "source", layer: "evidence", label: "Trust engagement", grain: "asset_day", query_ready: true }],
    execution_spec: { input_dataset_id: "trust", output_dataset_id: "attn", group_by: ["asset_id", "week"], metrics: [{ field: "attention", aggregate: "mean" }] },
    execution: { status: "registered", output_dataset_id: "attn", rows: 13827 },
  },
};

test("a built thread draws its input, the aggregate step and the measured output", () => {
  const g = methodGraph(built);
  assert.equal(g.inputs.length, 1);
  assert.equal(g.inputs[0].title, "Trust engagement");
  assert.equal(g.inputs[0].grain, "asset day");
  assert.deepEqual(g.steps.map((s) => s.kind), ["Aggregate"]);
  assert.deepEqual(g.steps[0].facts, ["mean of attention"]);
  assert.equal(g.output.rows, 13827);
  assert.equal(g.output.registered, true);
  assert.deepEqual(g.output.columns, ["asset_id", "week", "attention"]);
});

test("a join step appears only from a usable measured candidate and carries its numbers", () => {
  const t = structuredClone(built);
  t.state.execution_spec = null;
  t.state.nodes.push({ id: "mkt", dataset_id: "mkt", type: "source", layer: "evidence", label: "Markets", grain: "country_week" });
  t.state.join_candidates = [{ left_key: "country", right_key: "country", key_parts: ["country", "week"], matched: 5865, left_distinct: 6240, match_rate_pct: 94, right_duplicate_rows: 0, usable: true, complete_identity_domain: true }];
  const g = methodGraph(t);
  assert.deepEqual(g.steps.map((s) => s.kind), ["Join"]);
  assert.equal(g.steps[0].label, "on country, week");
  assert.equal(g.steps[0].facts[0], "94% of keys match");
  t.state.join_candidates[0].usable = false;
  assert.equal(methodGraph(t), null);
});

test("nothing recorded draws nothing", () => {
  assert.equal(methodGraph({ state: { nodes: [] } }), null);
});

test("mapped evidence with no method or spec draws no arrows", () => {
  const t = structuredClone(built);
  t.state.execution_spec = null;
  t.state.execution = null;
  assert.equal(methodGraph(t), null);
});

test("a proposal's spec draws as proposed, not built, and part detail says so", () => {
  const t = {
    title: "Weekly attention",
    state: {
      nodes: [{ id: "trust", dataset_id: "trust", type: "source", layer: "evidence", label: "Trust engagement", grain: "asset_day" }],
      proposal: { id: "p1", execution_spec: { input_dataset_id: "trust", output_dataset_id: "attn", group_by: ["week"], metrics: [{ field: "attention", aggregate: "mean" }] } },
    },
  };
  const g = methodGraph(t);
  assert.equal(g.proposed, true);
  assert.equal(g.output.registered, false);
  assert.equal(partDetail(g, "aggregate").note, "Proposed. Nothing has run.");
  assert.deepEqual(partDetail(g, "output").rows.at(-1), ["State", "Proposed · not run"]);
  assert.equal(partDetail(g, "trust").datasetId, "trust");
});
