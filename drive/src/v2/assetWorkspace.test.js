import assert from "node:assert/strict";
import test from "node:test";
import { buildAssetWorkspaceModel } from "./assetWorkspace.js";
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
