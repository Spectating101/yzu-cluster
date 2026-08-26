import test from "node:test";
import assert from "node:assert/strict";
import { buildDiscoverRestingSummary } from "./discoverRestingSummary.js";

test("empty search rows are not the lab size", () => {
  const summary = buildDiscoverRestingSummary([], new Set(["gdelt_asia_daily_country_panel"]));
  assert.equal(summary.hasResults, false);
  assert.equal(summary.found, 0);
  assert.equal(summary.heldCount, 0);
  assert.equal(summary.routes.length, 0);
  assert.notEqual(summary.found, 139);
});

test("found counts search rows, never holdings catalog length", () => {
  const rows = [
    { title: "Google Cloud offering", collect_via: "BigQuery" },
    { title: "LSEG offering", collect_via: "LSEG data API" },
    { title: "TWSE offering", collect_via: "queue" },
    { title: "SEC offering", collect_via: "a file manifest" },
    { title: "GDELT offering", collect_via: "an API query" },
  ];
  const summary = buildDiscoverRestingSummary(rows, new Set());
  assert.equal(summary.hasResults, true);
  assert.equal(summary.found, 5);
  assert.equal(summary.foundLine, "5 offerings");
  assert.equal(summary.heldCount, 0);
  assert.match(summary.heldLine, /0 of these 5 already held/);
  assert.match(summary.heldBody, /No offering here matched/i);
});

test("held join is labIds intersected with search rows, stated once", () => {
  const rows = [
    { title: "Held panel", dataset_id: "gdelt_asia_daily_country_panel", collect_via: "an API query" },
    { title: "External offering", collect_via: "BigQuery" },
  ];
  const summary = buildDiscoverRestingSummary(rows, new Set(["gdelt_asia_daily_country_panel"]));
  assert.equal(summary.found, 2);
  assert.equal(summary.heldCount, 1);
  assert.match(summary.heldLine, /1 of these 2 already held/);
  assert.equal(summary.heldBody, "");
  assert.equal(summary.comparisonBody, undefined);
});

test("routes tally scalar collect_via and flatten arrays", () => {
  const rows = [
    { title: "A", collect_via: "BigQuery" },
    { title: "B", collect_via: ["BigQuery", "ignored-second"] },
    { title: "C", collect_via: "queue" },
    { title: "D" },
  ];
  const summary = buildDiscoverRestingSummary(rows, new Set());
  assert.deepEqual(summary.routes, [
    { label: "BigQuery", count: 2 },
    { label: "queue", count: 1 },
  ]);
});

test("unknowns come from deriveUnknowns on unprobed rows, unique", () => {
  const rows = [
    { title: "A", collect_via: "http", url: "https://example.test/a" },
    { title: "B", collect_via: "http", url: "https://example.test/b" },
  ];
  const summary = buildDiscoverRestingSummary(rows, new Set(), "stablecoin");
  assert.ok(summary.unknowns.length);
  assert.ok(summary.unknowns.includes("Source endpoint not probed"));
  assert.equal(new Set(summary.unknowns).size, summary.unknowns.length);
  assert.equal(summary.query, "stablecoin");
});

test("the search rail carries external, Library, and reference territories without comparing unlike sets", () => {
  const rows = [
    { title: "BigQuery route", collect_via: "BigQuery", url: "https://example.test/query" },
    { title: "WRDS route" },
  ];
  const summary = buildDiscoverRestingSummary(rows, new Set(), "stablecoin", {
    libraryEvidenceCount: 18,
    contextCount: 2,
  });
  assert.equal(summary.found, 2);
  assert.equal(summary.libraryEvidenceCount, 18);
  assert.equal(summary.contextCount, 2);
  assert.equal(summary.landscapeLine, "2 external offerings · 18 Library results · 2 references");
});
