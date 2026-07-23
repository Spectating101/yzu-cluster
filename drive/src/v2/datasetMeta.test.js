import assert from "node:assert/strict";
import test from "node:test";
import { isQueryReadyReadiness, isReceiptOnlyAsset, statusPillKind } from "./datasetMeta.js";

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

test("fuzzy readiness substrings must not claim query ready", () => {
  assert.equal(isQueryReadyReadiness("not_ready"), false);
  assert.equal(isQueryReadyReadiness("metadata_search"), false);
  assert.equal(isQueryReadyReadiness("registered"), false);
  assert.equal(isQueryReadyReadiness("completed"), false);
  assert.equal(isQueryReadyReadiness("query_ready"), true);
  assert.equal(isQueryReadyReadiness("instant"), true);
});

test("completed, registered, and query-ready stay distinct", () => {
  assert.equal(statusPillKind({ analysis_readiness: "instant" }).kind, "query-ready");
  assert.equal(statusPillKind({ analysis_readiness: "query_ready" }).label, "Query-ready");
  assert.equal(statusPillKind({ analysis_readiness: "registered" }).label, "Registered");
  assert.equal(statusPillKind({ analysis_readiness: "completed" }).label, "Completed");
  assert.notEqual(
    statusPillKind({ analysis_readiness: "completed" }).kind,
    statusPillKind({ analysis_readiness: "registered" }).kind,
  );
  assert.notEqual(
    statusPillKind({ analysis_readiness: "registered" }).kind,
    statusPillKind({ analysis_readiness: "instant" }).kind,
  );
});

test("dataset readiness labels preserve the explicit access contract", () => {
  assert.equal(statusPillKind({ analysis_readiness: "instant_or_minutes" }).kind, "query-ready");
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

test("receipt_only reconciliation is classified as registered pending, not query-ready", () => {
  const receipt = {
    dataset_id: "any_registered_receipt",
    analysis_readiness: "registered",
    catalog_reconciliation: { state: "receipt_only", query_allowed: false },
  };
  assert.equal(isReceiptOnlyAsset(receipt), true);
  assert.equal(statusPillKind(receipt).kind, "registered");
  assert.match(statusPillKind(receipt).label, /reconciliation pending/i);
  assert.equal(
    isReceiptOnlyAsset({
      analysis_readiness: "registered",
      catalog_reconciliation: { state: "reconciled", query_allowed: true },
    }),
    false,
  );
  assert.equal(statusPillKind({ analysis_readiness: "registered" }).label, "Registered");
});
