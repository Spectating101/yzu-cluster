import assert from "node:assert/strict";
import { test } from "node:test";
import { instantLibraryMatches } from "./discoverInstantMatches.js";

const catalog = [
  { dataset_id: "bls_county", title: "County unemployment rate, NY/Miami-Dade", description: "Official BLS observations." },
  { dataset_id: "laus", title: "Unemployment rate, unemployed and labour force", description: "Five US counties." },
  { dataset_id: "twse", title: "TWSE daily market", description: "Trading value and TAIEX." },
  { title: "No id" },
];

test("a short keyword search finds held datasets at once, title matches first", () => {
  assert.deepEqual(instantLibraryMatches(catalog, "unemployment").map((row) => row.dataset_id), ["bls_county", "laus"]);
  assert.deepEqual(instantLibraryMatches(catalog, "county unemployment").map((row) => row.dataset_id), ["bls_county"]);
  assert.deepEqual(instantLibraryMatches(catalog, "TAIEX").map((row) => row.dataset_id), ["twse"]);
});

test("research questions and stopword-only queries are left to the server", () => {
  assert.deepEqual(instantLibraryMatches(catalog, "Do we hold monthly county unemployment data for Florida since 2015?"), []);
  assert.deepEqual(instantLibraryMatches(catalog, "the data"), []);
  assert.deepEqual(instantLibraryMatches(catalog, "unemployment volcano"), []);
});
