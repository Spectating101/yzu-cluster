import assert from "node:assert/strict";
import test from "node:test";

import { isDiscoverHistoryJob, jobTitle, jobToDiscoverHistoryEvent } from "./procurementJobs.js";

test("pending approvals do not claim every request is a collection", () => {
  const event = jobToDiscoverHistoryEvent({
    id: "synthesis-boundary",
    status: "pending_approval",
    plan: { title: "Synthesis boundary" },
  });

  assert.equal(event.summary, "Researcher approval is required before this request can continue");
  assert.doesNotMatch(event.summary, /collection begins/i);
});

test("placeholder job titles fall back to the durable job kind", () => {
  assert.equal(jobTitle({
    id: "job-synth",
    title: "synth block",
    plan: { job_type: "synthesis_execute" },
  }), "Synthesis execution");
});

test("internal operations do not enter the researcher Discover lifecycle", () => {
  assert.equal(isDiscoverHistoryJob({
    request: { _ops_internal: true },
    plan: { job_type: "collection_queue_batch" },
  }), false);
  assert.equal(isDiscoverHistoryJob({
    plan: { job_type: "scraper_run", execution_policy: { scope: "faculty" } },
  }), true);
});
