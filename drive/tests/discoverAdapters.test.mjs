import test from "node:test";
import assert from "node:assert/strict";
import {
  sourceResultToCandidate,
  durableHistoryToEvents,
  normalizeDiscoverMode,
  historyHoldingTruth,
} from "../src/v2/discoverAdapters.js";

test("sourceResultToCandidate maps Explore source rows for Discover UI", () => {
  const row = sourceResultToCandidate({
    kind: "source",
    source_id: "gdelt",
    provider: "GDELT Project",
    label: "GDELT news graph",
    title: "GDELT news graph",
    connector_id: "gdelt",
    access_mode: "materialized_bulk",
    capabilities: ["country_news_shocks"],
    endpoint: "gdeltproject.org",
    candidate_key: "source:gdelt_project:gdelt",
    preview_supported: true,
    collect_via: ["pipeline", "queue"],
  });
  assert.equal(row.source_id, "gdelt");
  assert.equal(row.candidate_key, "source:gdelt_project:gdelt");
  assert.equal(row.connector_id, "gdelt");
  assert.equal(row.title, "GDELT news graph");
  assert.equal(row.url, "https://gdeltproject.org");
  assert.equal(row.external, true);
});

test("durableHistoryToEvents adapts backend history items to trail events", () => {
  const events = durableHistoryToEvents({
    items: [
      {
        kind: "intent",
        id: "abc",
        title: "Smoke intent",
        status: "ready_for_review",
        updated_at: "2026-07-13T19:17:34+00:00",
        summary: "stablecoin transfers",
        candidate_key: "intent:abc",
      },
    ],
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "abc");
  assert.equal(events[0].action, "intent");
  assert.equal(events[0].target, "Smoke intent");
  assert.equal(events[0].meta.status, "ready_for_review");
  assert.equal(events[0].meta.candidate_key, "intent:abc");
  assert.ok(events[0].ts);
});

test("normalizeDiscoverMode maps legacy Search/Activity to Explore/History", () => {
  assert.equal(normalizeDiscoverMode("search"), "explore");
  assert.equal(normalizeDiscoverMode("activity"), "history");
  assert.equal(normalizeDiscoverMode("approvals"), "history");
  assert.equal(normalizeDiscoverMode("awaiting"), "history");
  assert.equal(normalizeDiscoverMode("history"), "history");
  assert.equal(normalizeDiscoverMode("explore"), "explore");
  assert.equal(normalizeDiscoverMode(""), "explore");
});

test("historyHoldingTruth keeps collected/registered/query-ready distinct", () => {
  const truth = historyHoldingTruth({
    kind: "registered_asset",
    status: "query_ready",
    meta: {
      dataset_id: "ds1",
      job_id: "j1",
      status: "query_ready",
      readiness: "query_ready",
      query_ready: true,
      catalog_reconciliation: { state: "receipt_only", query_allowed: false },
    },
  });
  assert.equal(truth.stages.collected, true);
  assert.equal(truth.stages.registered, true);
  assert.equal(truth.stages.queryReady, false);
});
