import test from "node:test";
import assert from "node:assert/strict";
import { facultyFacingRecords, isInternalValidationRecord } from "./productVisibility.js";

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
