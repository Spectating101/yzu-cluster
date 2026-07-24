import test from "node:test";
import assert from "node:assert/strict";
import {
  sourceResultToCandidate,
  durableHistoryToEvents,
  normalizeDiscoverMode,
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
      },
    ],
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "abc");
  assert.equal(events[0].action, "intent");
  assert.equal(events[0].target, "Smoke intent");
  assert.equal(events[0].meta.status, "ready_for_review");
  assert.ok(events[0].ts);
});

test("durableHistoryToEvents preserves verified registered asset identity", () => {
  const [event] = durableHistoryToEvents({
    items: [
      {
        kind: "registered_asset",
        id: "day2_deploy_smoke_20260720",
        title: "Day-2 deploy smoke",
        status: "registered",
        dataset_id: "day2_deploy_smoke_20260720",
        registry_id: "day2_deploy_smoke_20260720",
        manifest_id: "collection_manifest_day2-deploy-smoke-20260720a",
        job_id: "day2-deploy-smoke-20260720a",
        archive_verified: true,
        registry_readback: true,
        vault_path: "gdrive:Research-Drive/day2_deploy_smoke_20260720",
        catalog_reconciliation: { state: "receipt_only", query_allowed: false },
      },
    ],
  });

  assert.equal(event.kind, "registered_asset");
  assert.equal(event.dataset_id, "day2_deploy_smoke_20260720");
  assert.equal(event.meta.registry_id, "day2_deploy_smoke_20260720");
  assert.equal(event.meta.manifest_id, "collection_manifest_day2-deploy-smoke-20260720a");
  assert.equal(event.meta.job_id, "day2-deploy-smoke-20260720a");
  assert.equal(event.meta.readiness, "registered");
  assert.equal(event.meta.archive_verified, true);
  assert.equal(event.meta.registry_readback, true);
  assert.equal(event.meta.catalog_reconciliation.query_allowed, false);
});

test("sourceResultToCandidate preserves optional relevance/route signals", () => {
  const row = sourceResultToCandidate({
    title: "Polling commons",
    source_id: "polls",
    candidate_key: "source:polls",
    confident_match: true,
    relevance_score: 0.88,
    relevance_reason: "title and coverage match US polling",
    query_match: true,
    source_kind: "evidence_source",
    route_state: "specific",
  });
  assert.equal(row.confident_match, true);
  assert.equal(row.relevance_score, 0.88);
  assert.equal(row.relevance_reason, "title and coverage match US polling");
  assert.equal(row.query_match, true);
  assert.equal(row.source_kind, "evidence_source");
  assert.equal(row.route_state, "specific");
  assert.equal(row.candidate_key, "source:polls");
});

test("normalizeDiscoverMode maps legacy Search/Activity to Explore/History", () => {
  assert.equal(normalizeDiscoverMode("search"), "explore");
  assert.equal(normalizeDiscoverMode("activity"), "explore");
  assert.equal(normalizeDiscoverMode("approvals"), "explore");
  assert.equal(normalizeDiscoverMode("awaiting"), "explore");
  assert.equal(normalizeDiscoverMode("history"), "history");
  assert.equal(normalizeDiscoverMode("explore"), "explore");
  assert.equal(normalizeDiscoverMode(""), "explore");
});
