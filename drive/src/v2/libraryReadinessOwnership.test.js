import test from "node:test";
import assert from "node:assert/strict";
import { statusPillKind } from "./datasetMeta.js";

test("owned local holdings keep explicit query-ready state even when acquisition route is retained", () => {
  const state = statusPillKind({
    collect_via: "download",
    local_root: "research_panels/example",
    analysis_readiness: "instant",
  });
  assert.deepEqual(state, { kind: "query-ready", label: "Query ready" });
});

test("registered remote holdings keep explicit connected state even when collect_via is retained", () => {
  const state = statusPillKind({
    collect_via: "BigQuery",
    registered: true,
    backend: "bigquery_public_dataset",
    analysis_readiness: "dry_run_before_execution",
  });
  assert.deepEqual(state, { kind: "connected", label: "Connected" });
});

test("acquisition-only candidates still remain external", () => {
  const state = statusPillKind({ collect_via: "web", analysis_readiness: "instant" });
  assert.deepEqual(state, { kind: "external", label: "External" });
});
