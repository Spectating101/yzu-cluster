import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EXPLORATION_READY,
  isPreAcceptance,
  recommendedConstruction,
  researchBrief,
} from "./synthesisBrief.js";

test("the opening label is the spec's restrained one", () => {
  assert.equal(EXPLORATION_READY, "Exploration ready");
});

test("a new thread is pre-acceptance, so intent stays editable", () => {
  assert.equal(isPreAcceptance({ state: {} }), true);
  assert.equal(researchBrief({ state: {} }).editable, true);
});

test("an executed thread is not pre-acceptance", () => {
  assert.equal(isPreAcceptance({ state: { execution: { status: "registered" } } }), false);
});

test("an accepted construction leaves the opening state", () => {
  assert.equal(isPreAcceptance({ state: { execution_spec: { datasets: [] } } }), false);
});

test("the brief reads the researcher's own commitments", () => {
  const brief = researchBrief({
    state: {
      brief: "A reusable longitudinal measure of public attention.",
      required_grain: "asset × week",
      target_period: "2021 onward",
      intended_use: "reusable input for later empirical studies",
    },
  });
  assert.equal(brief.body, "A reusable longitudinal measure of public attention.");
  assert.equal(brief.targetGrain, "asset × week");
  assert.equal(brief.targetPeriod, "2021 onward");
  assert.equal(brief.intendedUse, "reusable input for later empirical studies");
});

test("the brief falls back to the thread objective, never to invented text", () => {
  const brief = researchBrief({ objective: "Weekly attention to stablecoins" });
  assert.equal(brief.body, "Weekly attention to stablecoins");
  assert.equal(brief.targetGrain, "");
  assert.equal(brief.targetPeriod, "");
});

test("no construction reports absent rather than an empty frame", () => {
  const rec = recommendedConstruction({ state: {} });
  assert.equal(rec.present, false);
  assert.equal(rec.alternatives, 0);
});

test("a construction with no evidence roles is not a construction", () => {
  const rec = recommendedConstruction({
    state: { constructions: [{ recommended: true, title: "Composite index", nodes: [] }] },
  });
  assert.equal(rec.present, false, "the spec's claim is that it is grounded in evidence roles");
});

test("the recommended construction carries its roles and counts alternatives", () => {
  const rec = recommendedConstruction({
    state: {
      constructions: [
        {
          recommended: true,
          title: "Composite weekly attention index",
          validation_role: "GDELT news",
          nodes: [
            { id: "trends", role: "search intent", source: "Google Trends", grain: "asset-week" },
            { id: "reddit", role: "community activity", source: "Reddit activity", grain: "asset-week" },
          ],
          ideal_direct_measure: {
            label: "Historical X follower growth",
            unavailable_because: "no verified history",
          },
          expected_output: {
            label: "Stablecoin attention weekly panel",
            grain: "asset-week",
            period: "2021–2026",
          },
          ai_resolved: ["source roles", "target grain"],
          method_will_resolve: ["component weighting", "missing-component rule"],
        },
        { title: "Event-only panel" },
        { title: "Single-source proxy" },
      ],
    },
  });
  assert.equal(rec.present, true);
  assert.equal(rec.title, "Composite weekly attention index");
  assert.equal(rec.nodes.length, 2);
  assert.equal(rec.nodes[0].role, "search intent");
  assert.equal(rec.validationRole, "GDELT news");
  assert.equal(rec.idealDirectMeasure.label, "Historical X follower growth");
  assert.equal(rec.expectedOutput.grain, "asset-week");
  assert.deepEqual(rec.methodWillResolve, ["component weighting", "missing-component rule"]);
  assert.equal(rec.alternatives, 2, "spec §6 counts alternatives but keeps them collapsed");
});
