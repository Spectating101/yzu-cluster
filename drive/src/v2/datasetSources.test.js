import assert from "node:assert/strict";
import { test } from "node:test";
import { listedSources, sourceSummary, sourcesHeading } from "./datasetSources.js";

const two = { source_system: "SEC EDGAR", sources: [{ source_system: "SEC EDGAR" }, { source_system: "Vendor mirror" }] };

test("a dataset with one source reads exactly as before", () => {
  assert.equal(sourceSummary({ source_system: "FRED" }), "FRED");
  assert.equal(sourceSummary({}), "Not recorded");
  assert.deepEqual(listedSources({ sources: [{ source_system: "FRED" }] }), []);
  assert.equal(sourcesHeading({ sources: [{ source_system: "FRED" }] }), "");
});

test("several sources are named, and many are counted", () => {
  assert.equal(sourceSummary(two), "SEC EDGAR + Vendor mirror");
  assert.equal(sourceSummary({ sources: [{ source_system: "A" }, { source_system: "B" }, { source_system: "C" }] }), "A + 2 more");
  assert.equal(sourcesHeading(two), "Available from 2 sources");
});

test("copies from one origin are called copies, not independent sources", () => {
  const same = { sources: [{ source_system: "SEC EDGAR" }, { source_system: "SEC EDGAR" }] };
  assert.equal(sourceSummary(same), "SEC EDGAR · 2 copies");
  assert.equal(sourcesHeading(same), "2 copies on record");
});
