import test from "node:test";
import assert from "node:assert/strict";
import { addedOn } from "./datasetDates.js";

test("a dataset reads when it entered the Library, preferring the retrieval date", () => {
  assert.equal(addedOn({ retrieved_at: "2026-03-04T10:00:00Z", collection: { wired_at: "2025-01-01" } }), "Added Mar 2026");
  assert.equal(addedOn({ procurement: { promoted_at: "2026-07-06" }, collection: { wired_at: "2025-01-01" } }), "Added Jul 2026");
  assert.equal(addedOn({ collection: { wired_at: "2025-11-30T00:00:00" } }), "Added Nov 2025");
});

test("no date or a malformed one says nothing rather than guessing", () => {
  assert.equal(addedOn({}), "");
  assert.equal(addedOn({ retrieved_at: "soon" }), "");
  assert.equal(addedOn({ retrieved_at: "2026-13-01" }), "");
});
