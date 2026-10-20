import test from "node:test";
import assert from "node:assert/strict";
import { reviewJobId } from "./reviewJobId.js";
import { coverageText } from "./coverageText.js";
import { collectionRecipe } from "./collectionRecipe.js";

test("review uses the bound job rather than the history event identity", () => {
  assert.equal(reviewJobId({ id: "event-1", meta: { job_id: "job-1" } }), "job-1");
  assert.equal(reviewJobId({ id: "event-1", bound_job: { id: "job-2" } }), "job-2");
  assert.equal(reviewJobId({ id: "job-3", status: "pending_approval" }), "job-3");
  assert.equal(reviewJobId({ id: "event-2", status: "registered" }), "");
});
test("coverage explains dates and missing cells", () => {
  const text = coverageText({ requested: { start: "2023-01-01", end: "2023-03-31" },
    status: "partial", usable_cells: 3, requested_cells: 4 });
  assert.match(text, /2023-01-01 → 2023-03-31/);
  assert.match(text, /partial/);
  assert.match(text, /3\/4 usable observations/);
  assert.equal(coverageText(null), "");
});
test("refresh requires a recorded public recipe", () => {
  const request = { series_ids: ["UNRATE"], start: "2023-01-01", end: "2023-03-31" };
  assert.deepEqual(collectionRecipe({ source_id: "fred_observations", coverage: { requested: request } }),
    { source_id: "fred_observations", request });
  assert.equal(collectionRecipe({ source_id: "lseg_history", coverage: { requested: request } }), null);
  assert.equal(collectionRecipe({ source_id: "fred_observations" }), null);
});

import { summarizeLibraryFreshness } from "./libraryFreshness.js";
test("retrieval date does not claim the observation period is current", () => {
  const summary = summarizeLibraryFreshness({ retrieved_at: "2026-10-05T04:50:53Z", coverage: { requested: { end: "2023-03-31" } } });
  assert.equal(summary.rootLabel, "Retrieved Oct 5");
  assert.equal(summary.dataAsOf, null);
  assert.equal(summary.isLive, false);
});

import { librarySourceReceipt } from "./libraryProvenance.js";
test("reconstructed endpoint is labelled separately from a recorded fetch URL", () => {
  const receipt = librarySourceReceipt({ source_url: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE",
    source_url_basis: "reconstructed_from_saved_recipe", retrieved_at: "2026-10-05T04:50:53Z" });
  assert.equal(receipt.sourceUrlKind, "Endpoint from saved recipe");
  assert.equal(receipt.fetchedAt, "2026-10-05T04:50:53Z");
});
