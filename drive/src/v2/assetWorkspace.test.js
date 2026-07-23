import assert from "node:assert/strict";
import test from "node:test";
import { buildAssetDecisionInstrument, buildAssetWorkspaceModel } from "./assetWorkspace.js";
import {
  libraryUploadCapability,
  libraryUrlIntakeCapability,
  serverStagingPresent,
} from "./libraryIntakeCapability.js";

test("asset workspace separates observed readiness from unknown quality scores", () => {
  const model = buildAssetWorkspaceModel({
    dataset_id: "gdelt_asia_daily_country_panel",
    name: "Asia daily news-risk panel",
    analysis_readiness: "instant",
    source: "GDELT GKG",
    coverage: "2018–2026",
    grain: "country-day",
    join_keys: ["date", "country"],
  });
  assert.equal(model.title, "Asia daily news-risk panel");
  assert.ok(model.overview.observed.some((row) => row.label === "Readiness"));
  assert.ok(model.quality.unknown.some((row) => row.label === "Quality score"));
  assert.ok(model.provenance.unknown.some((row) => /Provenance|Collection/i.test(row.label)));
});

test("asset workspace keeps readiness unknown when registry omits it", () => {
  const model = buildAssetWorkspaceModel({
    dataset_id: "x",
    name: "Sparse row",
  });
  assert.ok(model.overview.unknown.some((row) => row.label === "Readiness"));
  assert.equal(model.readiness.label, "Readiness unknown");
});

test("decision instrument is judgment + unknowns only — no registry fact dump", () => {
  const decision = buildAssetDecisionInstrument({
    dataset_id: "gdelt_asia_daily_country_panel",
    name: "Asia daily news-risk panel",
    analysis_readiness: "instant",
    source: "GDELT GKG",
    coverage: "2018–2026",
    grain: "country-day",
  });
  assert.match(decision.judgment, /Query-ready/i);
  assert.equal(decision.nextActionLabel, "Preview rows");
  assert.ok(decision.unknowns.some((row) => /Provenance/i.test(row.label)));
  assert.ok(!decision.unknowns.some((row) => row.label === "Source"));
  assert.ok(!decision.unknowns.some((row) => row.label === "Coverage"));
});

test("decision instrument surfaces readiness unknown when registry omits it", () => {
  const decision = buildAssetDecisionInstrument({
    dataset_id: "sparse",
    name: "Sparse",
  });
  assert.match(decision.judgment, /Readiness unknown/i);
  assert.ok(decision.unknowns.some((row) => row.label === "Readiness"));
});

test("upload capability requires observed staging_disk_free_gb", () => {
  assert.equal(serverStagingPresent(null), false);
  assert.equal(serverStagingPresent({ usage: {} }), false);
  assert.equal(libraryUploadCapability({ usage: {} }).uploadAvailable, false);
  assert.equal(
    libraryUploadCapability({ usage: { staging_disk_free_gb: 112 } }).uploadAvailable,
    true,
  );
});

test("url intake capability only promises Ask-assisted draft until durable id", () => {
  const url = libraryUrlIntakeCapability();
  assert.equal(url.available, true);
  assert.match(url.promise, /Ask-assisted draft/i);
  assert.match(url.promise, /durable backend intake job id/i);
  assert.match(url.submitLabel, /draft intake/i);
});
