import test from "node:test";
import assert from "node:assert/strict";
import { needRows, needSummary } from "./assessmentNeeds.js";

const dimensions = [
  { key: "unit", label: "Unit", value: "Unknown" },
  { key: "universe/geography", label: "Geography / universe", value: "country" },
  { key: "frequency", label: "Frequency", value: "monthly" },
  { key: "fields", label: "Fields", value: "unemployment rate" },
];

test("each assessed dimension gets the backend's own status", () => {
  const assessment = {
    assessment_basis: {
      dimension_status: { "universe/geography": "not_supported", frequency: "unverified", fields: "not_supported" },
    },
  };
  const rows = needRows(assessment, dimensions);
  assert.deepEqual(rows.map((row) => [row.value, row.mark]), [["country", "✗"], ["monthly", "?"], ["unemployment rate", "✗"]]);
  assert.equal(needSummary(rows), "2 not recorded · 1 unverified");
});

test("no dimension status means no band rows, not invented marks", () => {
  assert.deepEqual(needRows({}, dimensions), []);
  assert.deepEqual(needRows({ assessment_basis: { dimension_status: {} } }, dimensions), []);
});

test("unknown status words fall back to not recorded", () => {
  const rows = needRows({ assessment_basis: { dimension_status: { frequency: "weird" } } }, dimensions);
  assert.equal(rows[0].mark, "?");
  assert.equal(rows[0].note, "nothing recorded");
});

test("the same value parsed into two dimensions shows once", () => {
  const rows = needRows(
    { assessment_basis: { dimension_status: { unit: "not_supported", fields: "not_supported" } } },
    [{ key: "unit", label: "Unit", value: "unemployment rate" }, { key: "fields", label: "Fields", value: "Unemployment rate" }],
  );
  assert.deepEqual(rows.map((row) => row.key), ["fields"]);
});
