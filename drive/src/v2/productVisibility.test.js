import test from "node:test";
import assert from "node:assert/strict";
import { facultyFacingRecords, isInternalValidationRecord, rankFacultyHomeRecords } from "./productVisibility.js";

test("filters deployment and canary residue from faculty-facing collections", () => {
  const rows = [
    { dataset_id: "sec_tickers_final_land.final.20260722194753", name: "Final landing Windows HTTP prove" },
    { dataset_id: "sec_company_tickers_scheduled_canary_20260722", name: "Scheduled Windows SEC canary 20260722" },
    { id: "agent_canary_20260722", title: "Agent canary 20260722" },
    { dataset_id: "gdelt_asia_daily_country_panel", name: "GDELT Asia daily country panel" },
  ];

  assert.deepEqual(
    facultyFacingRecords(rows).map((row) => row.dataset_id || row.id),
    ["gdelt_asia_daily_country_panel"],
  );
});

test("filters technical synthesis residue while preserving substantive work", () => {
  const threads = [
    { id: "agent_canary", title: "Agent canary 20260722_204056" },
    { id: "live-sec-canary", title: "Live SEC ticker synthesis canary 2" },
    { id: "smoke", title: "Live smoke thread" },
    { id: "audit", title: "Composer audit thread" },
    { id: "test", title: "test" },
    { id: "jkse", title: "JKSE PIT × IDN microstructure × estimate revisions" },
  ];

  assert.deepEqual(
    facultyFacingRecords(threads).map((row) => row.id),
    ["jkse"],
  );
});

test("ranks analytically useful assets ahead of operational receipts", () => {
  const ranked = rankFacultyHomeRecords([
    {
      dataset_id: "procured_sec_refresh",
      name: "Collect Discover refresh sec_edgar",
      grain: "procured_snapshot",
      analysis_readiness: "registered",
      summary: "Verified registered asset recovered from its durable registration receipt.",
    },
    {
      dataset_id: "gdelt_asia_daily_country_panel",
      name: "GDELT Asia Daily Country News Shock Panel",
      grain: "country_day",
      analysis_readiness: "query_ready",
      coverage: "2018-present",
      source: "GDELT",
      summary: "Daily country-level news intensity and shock measures for event-study and macro-finance research.",
    },
  ]);

  assert.equal(ranked[0].dataset_id, "gdelt_asia_daily_country_panel");
});

test("explicit faculty visibility overrides a suspicious technical label", () => {
  assert.equal(
    isInternalValidationRecord({
      dataset_id: "canary_islands_macro_panel",
      name: "Canary Islands macro panel",
      product_visibility: "faculty",
    }),
    false,
  );
});

test("ordinary research records containing proof language remain visible", () => {
  assert.equal(
    isInternalValidationRecord({
      dataset_id: "audit_evidence_panel",
      name: "Proof of reserves research panel",
      summary: "Research evidence for reserve attestations",
    }),
    false,
  );
});
