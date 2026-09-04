import test from "node:test";
import assert from "node:assert/strict";
import { libraryEvidenceGraph, libraryUsageEvent } from "./libraryEvidenceGraph.js";


test("evidence graph keeps logical identity separate from versions and storage holdings", () => {
  const graph = libraryEvidenceGraph({
    dataset_id: "panel-1",
    version_id: "v4",
    content_sha256: "abc123",
    holdings: [
      { holding_id: "h1", provider: "Google Drive", provider_item_id: "g-9", account_id: "acct-1", path: "/Research/panel.csv", access: "read" },
      { holding_id: "h2", provider: "YZUC cluster", path: "/query/panel.parquet", query_ready: true, access: "read" },
    ],
    lineage: { upstream_dataset_ids: ["raw-a", "raw-b"] },
  });
  assert.equal(graph.logicalAssetId, "panel-1");
  assert.equal(graph.version.id, "v4");
  assert.equal(graph.holdings.length, 2);
  assert.equal(graph.holdings[0].providerItemId, "g-9");
  assert.deepEqual(graph.lineage.upstream, ["raw-a", "raw-b"]);
});


test("usage event is a durable backend envelope, not UI-local prose", () => {
  const event = libraryUsageEvent({
    dataset: { dataset_id: "panel-1", version_id: "v4" },
    action: "query",
    projectId: "thesis",
    relatedAssetIds: ["macro", "macro", "events"],
    outputId: "query-42",
    at: "2026-09-04T15:00:00Z",
    context: { grain: "country_day" },
  });
  assert.equal(event.logical_asset_id, "panel-1");
  assert.equal(event.version_id, "v4");
  assert.deepEqual(event.related_asset_ids, ["macro", "events"]);
  assert.equal(event.occurred_at, "2026-09-04T15:00:00Z");
});
