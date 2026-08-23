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
