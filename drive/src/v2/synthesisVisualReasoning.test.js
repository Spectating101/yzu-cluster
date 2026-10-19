import assert from "node:assert/strict";
import test from "node:test";
import { joinOverlapModel, scopeRetentionModel, unitScaleModel } from "./synthesisVisualReasoning.js";

test("join overlap separates left-only, shared, and right-only without inventing population", () => {
  const model = joinOverlapModel({ leftTotal: 635, rightTotal: 570, shared: 50 });
  assert.equal(model.leftOnly, 585);
  assert.equal(model.shared, 50);
  assert.equal(model.rightOnly, 520);
  assert.equal(model.union, 1155);
  assert.equal(model.leftReach, 7.874);
  assert.equal(model.rightReach, 8.772);
  assert.equal(Number(model.regions.reduce((sum, region) => sum + region.percent, 0).toFixed(2)), 100);
});

test("scope visual preserves the real row boundary and recommended smallest cut", () => {
  const model = scopeRetentionModel({
    rows: 1043042,
    limit: 1000000,
    recommended: { id: "2020", rows: 969392 },
    options: [
      { id: "2020", label: "from 2020-01-01", rows: 969392, clears: true, recommended: true },
      { id: "2023", label: "from 2023-01-01", rows: 506163, clears: true, recommended: false },
    ],
  });
  assert.equal(model.kept, 969392);
  assert.equal(model.discarded, 73650);
  assert.equal(model.keptPercent, 92.939);
  assert.equal(model.discardedPercent, 7.061);
  assert.equal(model.limitPercent, 95.873);
});

test("unit visual uses common magnitude scales while preserving signed values", () => {
  const model = unitScaleModel(
    {
      left: { column: "return_1d", typical: 0.0006 },
      right: { column: "rf", typical: 0.012 },
    },
    [
      { id: "rescaled", label: "Rescale rf", result: -0.0002, recommended: true },
      { id: "raw", label: "Leave as-is", result: -0.02 },
    ],
  );
  assert.equal(model.inputs[0].value, 0.0006);
  assert.equal(model.inputs[1].value, 0.012);
  assert.equal(model.inputs[0].percent, 5);
  assert.equal(model.inputs[1].percent, 100);
  assert.equal(model.results[0].value, -0.0002);
  assert.equal(model.results[1].value, -0.02);
  assert.equal(model.results[0].percent, 1);
  assert.equal(model.results[1].percent, 100);
});
