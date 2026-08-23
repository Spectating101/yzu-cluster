import assert from "node:assert/strict";
import test from "node:test";

import { historyLifecycleExplanation, historyLifecycleLabel } from "./historyLifecycleLabel.js";

/**
 * active, paused and stopped are the declared subscription states
 * (discover_refresh_store.py). All three read as "Scheduled refresh", so a
 * stopped refresh — which will never run again — was indistinguishable from a
 * live one, and some kinds rendered the raw lowercase status as their label.
 */
const KINDS = ["subscription", "collection_run", "scheduled", "registered_asset"];

test("paused and stopped are not reported as an active schedule", () => {
  for (const kind of KINDS) {
    assert.equal(historyLifecycleLabel({ kind, status: "paused" }), "Refresh paused");
    assert.equal(historyLifecycleLabel({ kind, status: "stopped" }), "Refresh stopped");
  }
});

test("no declared state renders as a raw lowercase token", () => {
  for (const kind of KINDS) {
    for (const status of ["active", "paused", "stopped"]) {
      const label = historyLifecycleLabel({ kind, status });
      assert.notEqual(label, status, `${kind}/${status} rendered its raw status as the label`);
      assert.match(label, /^[A-Z]/, `${kind}/${status} -> ${label} is not a human label`);
    }
  }
});

test("a stopped refresh says it will not run again", () => {
  const x = historyLifecycleExplanation({ kind: "subscription", status: "stopped" });
  assert.match(x.explanation, /will not run again/i);
  assert.ok(x.risk && x.next, "a terminal state must still say what it costs and what to do");
});

test("a paused refresh says it resumes only when restarted", () => {
  const x = historyLifecycleExplanation({ kind: "subscription", status: "paused" });
  assert.match(x.explanation, /not running|resumes only/i);
  assert.match(x.risk, /drift/i);
});

test("neither state falls back to the generic explanation", () => {
  for (const status of ["paused", "stopped"]) {
    const x = historyLifecycleExplanation({ kind: "subscription", status });
    assert.doesNotMatch(x.explanation, /does not report a named research stage/i);
  }
});

test("an active schedule is still a scheduled refresh", () => {
  // `kind` inside the labeller is a derived bucket, not the event's kind field,
  // so exercise it the way a real scheduled event arrives.
  assert.equal(historyLifecycleLabel({ kind: "scheduled", status: "scheduled" }), "Scheduled refresh");
  assert.equal(historyLifecycleLabel({ kind: "subscription", status: "active" }), "Scheduled refresh");
});

test("cancelled still wins over the refresh states", () => {
  assert.equal(historyLifecycleLabel({ kind: "subscription", status: "cancelled" }), "Cancelled");
});

/**
 * The feed reports query_ready / usable / readiness on the event. The label
 * keyed only off catalog_reconciliation, so a held usable asset and an archived
 * unusable one both read "Registered" — 39 of 60 live history rows.
 */
const HELD_USABLE = {
  kind: "registered_asset",
  status: "query_ready",
  dataset_id: "craft_openapi_twse_com_tw_b3852fe1a8",
  query_ready: true,
  usable: true,
  readiness: "query_ready",
  holding_status: "held",
  catalog_reconciliation: { state: "receipt_only", registry_row_loaded: false },
};
const ARCHIVED_UNUSABLE = {
  kind: "registered_asset",
  status: "registered_not_queryable",
  dataset_id: "craft_flex_http_usgs2_1784803696",
  query_ready: false,
  usable: false,
  readiness: "registered",
  holding_status: "archived",
  catalog_reconciliation: { state: "receipt_only", registry_row_loaded: false },
};

test("a usable holding and an unusable one do not share a label", () => {
  const a = historyLifecycleLabel(HELD_USABLE);
  const b = historyLifecycleLabel(ARCHIVED_UNUSABLE);
  assert.notEqual(a, b, `both rendered as "${a}"`);
});

test("an unusable holding says so", () => {
  assert.equal(historyLifecycleLabel(ARCHIVED_UNUSABLE), "Not query-ready");
  const x = historyLifecycleExplanation(ARCHIVED_UNUSABLE);
  assert.match(x.explanation, /not queryable/i);
  assert.ok(x.next);
});

test("a usable holding with an unread registry row is not over-claimed", () => {
  const label = historyLifecycleLabel(HELD_USABLE);
  assert.equal(label, "Registered · reconciliation pending");
  assert.notEqual(label, "Query ready", "must not claim query-ready without registry read-back");
  const x = historyLifecycleExplanation(HELD_USABLE);
  assert.match(x.risk, /may not match/i);
});

test("a confirmed query-ready holding is still Query ready", () => {
  const confirmed = {
    ...HELD_USABLE,
    catalog_reconciliation: { state: "reconciled", registry_row_loaded: true },
  };
  assert.equal(historyLifecycleLabel(confirmed), "Query ready");
});
