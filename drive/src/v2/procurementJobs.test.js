import assert from "node:assert/strict";
import test from "node:test";

import { jobToDiscoverHistoryEvent } from "./procurementJobs.js";

test("pending approvals do not claim every request is a collection", () => {
  const event = jobToDiscoverHistoryEvent({
    id: "synthesis-boundary",
    status: "pending_approval",
    plan: { title: "Synthesis boundary" },
  });

  assert.equal(event.summary, "Researcher approval is required before this request can continue");
  assert.doesNotMatch(event.summary, /collection begins/i);
});
