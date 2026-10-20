import test from "node:test";
import assert from "node:assert/strict";
import { freshnessDate, refreshPolicyLabel, summarizeLibraryFreshness } from "./libraryFreshness.js";

test("pipeline freshness uses explicit refresh facts", () => {
  const summary = summarizeLibraryFreshness({
    refresh_policy: "daily",
    last_refreshed_at: "2026-09-03T15:15:00Z",
    next_refresh_at: "2026-09-04T15:15:00Z",
    data_as_of: "2026-09-03",
    stale: false,
  }, { kind: "dataset" });

  assert.equal(summary.cadenceLabel, "Daily");
  assert.equal(summary.rootLabel, "Through Sep 3");
  assert.equal(summary.rootDetail, "Daily");
  assert.equal(summary.basisLabel, "Through Sep 3 · Daily");
  assert.equal(summary.lastRefreshedAt, "2026-09-03T15:15:00Z");
  assert.equal(summary.nextRefreshAt, "2026-09-04T15:15:00Z");
  assert.equal(summary.stale, false);
});

test("generic record modification never becomes a data refresh claim", () => {
  const summary = summarizeLibraryFreshness({
    updated_at: "2026-09-03T15:15:00Z",
  }, { kind: "dataset" });

  assert.equal(summary.lastRefreshedAt, null);
  assert.equal(summary.dataAsOf, null);
  assert.equal(summary.rootLabel, "Not tracked");
  assert.equal(summary.hasFreshnessEvidence, false);
  assert.equal(summary.recordUpdatedAt, "2026-09-03T15:15:00Z");
});

test("scholarly work is static unless a refresh contract is explicitly recorded", () => {
  const summary = summarizeLibraryFreshness({ updated_at: "2026-09-01T00:00:00Z" }, { kind: "scholarly_work" });
  assert.equal(summary.rootLabel, "Static");
  assert.equal(summary.isStatic, true);
  assert.equal(summary.hasPipeline, false);
});

test("stale pipeline stays distinct from readiness", () => {
  const summary = summarizeLibraryFreshness({
    refresh_policy: "weekly",
    last_refreshed_at: "2026-08-20T08:00:00Z",
    stale: true,
  }, { kind: "dataset" });

  assert.equal(summary.rootLabel, "Stale");
  assert.equal(summary.rootDetail, "Aug 20 · Weekly");
  assert.equal(summary.basisLabel, "Stale · Weekly");
});

test("cadence labels preserve useful nonstandard schedules", () => {
  assert.equal(refreshPolicyLabel("every_3_days"), "Every 3 days");
  assert.equal(refreshPolicyLabel("on_demand"), "On demand");
  assert.equal(freshnessDate("2026-09-03", { year: true }), "Sep 3, 2026");
});
