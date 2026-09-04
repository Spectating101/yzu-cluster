import assert from "node:assert/strict";
import test from "node:test";
import {
  holdingAccessLabel,
  holdingRoleLabel,
  holdingStateLabel,
  libraryHoldings,
  summarizeLibraryHoldings,
} from "./libraryHoldings.js";

test("normalizes explicit federated holdings without inventing storage from unrelated fields", () => {
  const dataset = {
    dataset_id: "panel",
    local_root: "should-not-become-a-holding",
    holdings: [
      {
        holding_id: "cluster",
        provider: "YZUC Research Cluster",
        custodian: "Research Drive",
        role: "Query-ready replica",
        access: "available",
        state: "synced",
        path: "Research panels / Taiwan",
        active: true,
        query_ready: true,
      },
      {
        provider: "Dropbox",
        owner: "Prof. Kong",
        role: "Original holding",
        permission: "restricted",
        sync_state: "current",
        location: "Finance Research / panel.csv",
        original: true,
      },
    ],
  };
  const holdings = libraryHoldings(dataset);
  assert.equal(holdings.length, 2);
  assert.equal(holdings[0].provider, "YZUC Research Cluster");
  assert.equal(holdings[0].access, "available");
  assert.equal(holdings[0].state, "current");
  assert.equal(holdingAccessLabel(holdings[0]), "Available");
  assert.equal(holdingStateLabel(holdings[0]), "Current");
  assert.equal(holdingRoleLabel(holdings[0]), "Query-ready replica");
  assert.equal(holdings[1].custodian, "Prof. Kong");
  assert.equal(holdings[1].access, "restricted");
});

test("summarizes locations and access while keeping active holding explicit", () => {
  const summary = summarizeLibraryHoldings({
    holdings: [
      { provider: "YZUC Research Cluster", access: true, state: "current", active: true },
      { provider: "Google Drive", access: "read_only", state: "current" },
      { provider: "Dropbox", access: false, state: "stale" },
    ],
  });
  assert.equal(summary.count, 3);
  assert.equal(summary.availableCount, 2);
  assert.equal(summary.restrictedCount, 1);
  assert.equal(summary.staleCount, 1);
  assert.equal(summary.headline, "3 locations · 2 available");
  assert.equal(summary.focus.provider, "YZUC Research Cluster");
  assert.deepEqual(summary.providers, ["YZUC Research Cluster", "Google Drive", "Dropbox"]);
});

test("does not infer a holdings topology when the registry has not recorded one", () => {
  const dataset = {
    dataset_id: "legacy",
    source: "GDELT",
    local_path: "data/gdelt.csv",
    backend: "sqlite",
  };
  const summary = summarizeLibraryHoldings(dataset);
  assert.equal(summary.count, 0);
  assert.equal(summary.headline, "No holdings recorded");
});
