import assert from "node:assert/strict";
import test from "node:test";
import { previewCellValue, researcherPreviewReason } from "./previewValue.js";

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

test("preview boundaries translate authorization internals into researcher language", () => {
  assert.equal(
    researcherPreviewReason("Desk role public_guest lacks permission: submit_collection"),
    "Collection requests require a research-member account. This preview has not started collection.",
  );
  assert.doesNotMatch(
    researcherPreviewReason("Traceback: PrivateConnectorException at /srv/private/adapter.py"),
    /Traceback|PrivateConnector|\/srv\//,
  );
});
