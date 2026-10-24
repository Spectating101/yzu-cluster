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
  assert.equal(g.steps[0].id, "aggregate");
  assert.deepEqual(g.steps[0].facts, ["mean of attention"]);
  assert.equal(g.output.rows, 13827);
  assert.equal(g.output.registered, true);
  assert.deepEqual(g.output.columns, ["asset_id", "week", "attention"]);
});

test("recorded transforms draw in order, joins add their right dataset, and a matching measurement adds its numbers", () => {
  const t = structuredClone(built);
  t.state.execution_spec = {
    input_dataset_id: "trust",
    output_dataset_id: "attn",
    transforms: [
      { op: "filter", column: "year", cmp: ">=", value: 2020 },
      { op: "join", right_dataset_id: "mkt", on: ["country", "week"], how: "inner" },
    ],
    group_by: ["week"],
    metrics: [],
  };
  t.state.nodes.push({ id: "mkt", dataset_id: "mkt", type: "source", layer: "evidence", label: "Markets", grain: "country_week" });
  t.state.join_candidates = [{ left_dataset_id: "trust", right_dataset_id: "mkt", left_key: "country", right_key: "country", key_parts: ["country", "week"], matched: 5865, left_distinct: 6240, match_rate_pct: 94, right_duplicate_rows: 0, usable: true }];
  const g = methodGraph(t);
  assert.deepEqual(g.inputs.map((i) => i.id), ["trust", "mkt"]);
  assert.deepEqual(g.steps.map((s) => s.kind), ["Filter", "Join", "Aggregate"]);
  const join = g.steps[1];
  assert.equal(join.label, "inner on country, week");
  assert.equal(join.facts[0], "94% of keys match");
  assert.equal(join.measured, true);
  t.state.join_candidates = [];
  const unmeasured = methodGraph(t).steps[1];
  assert.equal(unmeasured.measured, false);
  assert.deepEqual(unmeasured.facts, ["with Markets"]);
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

test("measured evidence with no method or spec draws nothing", () => {
  const t = structuredClone(built);
  t.state.execution_spec = null;
  t.state.execution = null;
  assert.equal(methodGraph(t), null);
  assert.equal(methodGraph({ state: { nodes: [] } }), null);
});

test("repeated step kinds get distinct ids", () => {
  const t = structuredClone(built);
  t.state.execution_spec.transforms = [{ op: "filter", column: "a", cmp: "==", value: 1 }, { op: "filter", column: "b", cmp: "==", value: 2 }];
  assert.deepEqual(methodGraph(t).steps.map((s) => s.id), ["filter-1", "filter-2", "aggregate"]);
});

test("every recorded step draws, including returns, derived keys and as-of joins", () => {
  const t = {
    title: "BTC volatility and CO2",
    state: {
      nodes: [
        { dataset_id: "crypto", layer: "evidence", label: "Crypto daily prices" },
        { dataset_id: "co2", layer: "evidence", label: "Mauna Loa CO₂" },
      ],
      execution_spec: {
        input_dataset_id: "crypto",
        output_dataset_id: "synthesis_btc",
        transforms: [
          { op: "filter", column: "Instrument", cmp: "eq", value: "BTC-USD" },
          { op: "pct_change", column: "Price_Close", by: [], order_by: ["Date"], as: "ret" },
          { op: "rename", mapping: { Date: "day" } },
          { op: "derive", as: "month", expr: "date_trunc(day, 'month')" },
          { op: "join_asof", right_dataset_id: "co2", left_on: "day", right_on: "Date", direction: "backward", tolerance: "31D" },
          { op: "brand_new_op" },
        ],
        group_by: ["month"],
        metrics: [{ function: "std", column: "ret", as: "btc_vol" }, { function: "mean", column: "Average", as: "co2_ppm" }, { function: "count", as: "days" }],
      },
    },
  };
  const g = methodGraph(t);
  assert.deepEqual(g.inputs.map((i) => i.id), ["crypto", "co2"]);
  assert.deepEqual(g.steps.map((s) => s.kind), ["Filter", "% change", "Rename", "Derive", "As-of join", "Brand new op", "Aggregate"]);
  assert.equal(g.steps[0].label, "Instrument = BTC-USD");
  assert.equal(g.steps[1].label, "Price_Close as ret");
  assert.equal(g.steps[2].label, "Date → day");
  assert.equal(g.steps[3].label, "month = date_trunc(day, 'month')");
  assert.equal(g.steps[4].label, "latest Mauna Loa CO₂ row at or before each day");
  assert.deepEqual(g.steps[4].facts, ["day → Date", "no older than 31D"]);
  assert.deepEqual(g.steps[6].facts, ["std of ret as btc_vol", "mean of Average as co2_ppm", "count as days"]);
});
