import assert from "node:assert/strict";
import test from "node:test";
import { previewCellValue } from "./previewValue.js";

test("preview values keep structured evidence readable", () => {
  assert.equal(previewCellValue({ score: 0.8, flags: ["held", "verified"] }), '{"score":0.8,"flags":["held","verified"]}');
  assert.equal(previewCellValue(["county", "month"]), '["county","month"]');
  assert.equal(previewCellValue(null), "—");
});

test("preview values show a useful filename without leaking host topology", () => {
  assert.equal(
    previewCellValue("/mnt/research-data/private/crsp/panel.parquet"),
    "panel.parquet",
  );
  assert.equal(previewCellValue("file:///tmp/private/report.csv"), "report.csv");
  assert.equal(previewCellValue("https://example.test/data.csv"), "https://example.test/data.csv");
  assert.equal(previewCellValue("/api/v1/observations"), "/api/v1/observations");
});
