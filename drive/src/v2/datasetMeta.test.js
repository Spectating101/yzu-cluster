import test from "node:test";
import assert from "node:assert/strict";
import {
  canIUseDecision,
  demotionSentence,
  hydrateRemedy,
  isQueryReadyReadiness,
  libraryAssetKind,
  libraryAssetPresentation,
  statusPillKind,
} from "./datasetMeta.js";

test("unknown readiness is never promoted to query ready", () => {
  assert.deepEqual(statusPillKind({ dataset_id: "unknown" }), {
    kind: "unknown",
    label: "Readiness unknown",
  });
  assert.deepEqual(statusPillKind({ dataset_id: "novel", analysis_readiness: "new_state" }), {
    kind: "unknown",
    label: "Readiness unknown",
  });
});

test("readiness projection stays null-safe before a dataset is selected", () => {
  assert.deepEqual(statusPillKind(null), {
    kind: "unknown",
    label: "Readiness unknown",
  });
});

test("fuzzy readiness substrings must not claim query ready", () => {
  assert.equal(isQueryReadyReadiness("not_ready"), false);
  assert.equal(isQueryReadyReadiness("metadata_search"), false);
  assert.equal(isQueryReadyReadiness("registered"), false);
  assert.equal(isQueryReadyReadiness("query_ready"), true);
  assert.equal(isQueryReadyReadiness("instant"), true);
});

test("dataset readiness labels preserve the explicit access contract", () => {
  assert.equal(statusPillKind({ analysis_readiness: "instant" }).kind, "query-ready");
  assert.equal(statusPillKind({ analysis_readiness: "instant_or_minutes" }).kind, "query-ready");
  assert.equal(statusPillKind({ analysis_readiness: "query_ready" }).label, "Query ready");
  assert.equal(statusPillKind({ analysis_readiness: "registered" }).label, "Registered");
  assert.equal(statusPillKind({ analysis_readiness: "connected" }).kind, "connected");
  assert.equal(statusPillKind({ analysis_readiness: "dry_run_before_execution" }).kind, "connected");
  assert.equal(statusPillKind({ analysis_readiness: "metadata_search" }).label, "Metadata only");
  assert.equal(statusPillKind({ analysis_readiness: "metadata_only" }).label, "Metadata only");
  assert.equal(statusPillKind({ analysis_readiness: "procurement_planning" }).kind, "queued");
  assert.equal(statusPillKind({ analysis_readiness: "failed" }).kind, "failed");
});

test("external acquisition rows remain external regardless of readiness text", () => {
  assert.equal(statusPillKind({ collect_via: "web", analysis_readiness: "instant" }).kind, "external");
});

test("instant readiness is not query-ready when local panel is missing at runtime", () => {
  const pill = statusPillKind({
    analysis_readiness: "instant",
    runtime_readiness_reason: "local_panel_missing",
  });
  assert.notEqual(pill.kind, "query-ready");
  assert.notEqual(pill.label, "Query ready");
});

test("declared instant without a runtime reason stays query-ready", () => {
  assert.equal(statusPillKind({ analysis_readiness: "instant" }).kind, "query-ready");
});

test("demotion sentence names the measured gap, not a generic warning", () => {
  assert.equal(
    demotionSentence({
      analysis_readiness: "instant",
      runtime_readiness_reason: "local_panel_missing",
    }),
    "Declared queryable; local panel is missing.",
  );
  assert.equal(
    demotionSentence({ runtime_readiness_reason: "local_bytes_missing" }),
    "Declared queryable; local bytes are missing.",
  );
  assert.equal(demotionSentence({ analysis_readiness: "instant" }), "");
});

test("any runtime readiness reason blocks Query-ready, including unknown future reasons", () => {
  const pill = statusPillKind({
    analysis_readiness: "instant",
    runtime_readiness_reason: "new_engine_reason_v2",
  });
  assert.notEqual(pill.kind, "query-ready");
  assert.equal(
    demotionSentence({
      analysis_readiness: "instant",
      runtime_readiness_reason: "new_engine_reason_v2",
    }),
    "Declared queryable; runtime readiness is not confirmed.",
  );
});

test("hydrate remedy is silent unless the engine set hydrate_required", () => {
  assert.equal(hydrateRemedy({ runtime_readiness_reason: "local_bytes_missing" }), "");
  assert.equal(hydrateRemedy({ hydrate_required: false }), "");
  assert.equal(
    hydrateRemedy({ hydrate_required: true, runtime_readiness_reason: "local_bytes_missing" }),
    "A vault archive is available to restore local bytes.",
  );
});

test("Can I use this keeps the demotion and does not drop the hydrate remedy", () => {
  const decision = canIUseDecision({
    analysis_readiness: "instant",
    runtime_readiness_reason: "local_bytes_missing",
    hydrate_required: true,
  });
  assert.equal(decision.headline, "Not query-ready");
  assert.match(decision.body, /local bytes are missing/);
  assert.match(decision.body, /vault archive is available to restore local bytes/);
});

test("a procured paper is presented as a scholarly work, not a tabular dataset", () => {
  const paper = {
    dataset_id: "datacite_10.5281_zenodo.58938",
    name: "Arbitrage Pricing and Efficient Markets Paper",
    backend: "local_file",
    access_shape: "local_file",
    analysis_readiness: "metadata_search",
    grain: "procured_snapshot",
    one_line: "A research work useful for finance literature grounding and citation.",
  };
  assert.equal(libraryAssetKind(paper), "scholarly_work");
  assert.deepEqual(libraryAssetPresentation(paper), {
    kind: "scholarly_work",
    noun: "scholarly work",
    eyebrow: "Selected scholarly work",
    shapeTitle: "Bibliographic record",
    structureTitle: "Record details",
    structureAction: "Inspect record",
    askLabel: "Ask about this work",
    previewRows: false,
  });
});

test("metadata catalogues and normal panels keep distinct Library projections", () => {
  assert.equal(
    libraryAssetKind({ access_shape: "metadata_index", backend: "local_jsonl_catalog" }),
    "metadata_index",
  );
  assert.equal(
    libraryAssetKind({
      name: "Daily market panel",
      backend: "local_csv",
      access_shape: "local_derived_tables",
      grain: "firm_day",
      analysis_readiness: "instant",
    }),
    "dataset",
  );
});
