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

test("history summaries name the job source in plain language", () => {
  const event = jobToDiscoverHistoryEvent({ id: "j1", status: "completed", request: { source: "discover_intent" } });
  assert.equal(event.summary, "Discover request · completed");
  assert.equal(event.meta.source_id, "discover_intent");
  const other = jobToDiscoverHistoryEvent({ id: "j2", status: "failed", plan: { source: "sec_edgar_filings" } });
  assert.equal(other.summary, "SEC EDGAR filings · failed");
});

