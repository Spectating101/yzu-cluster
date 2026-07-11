import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LIFECYCLE,
  buildDiscoverLifecycle,
  classifyJobLifecycle,
  exactJobsForCandidate,
  selectLifecycleJob,
} from "./discoverLifecycle.js";

const ROW = {
  candidate_key: "dataset:mops_financial_statements_ext",
  dataset_id: "mops_financial_statements_ext",
  title: "MOPS financial statements",
  url: "https://mops.twse.com.tw/example",
  connector_id: "mops_tw",
};

function job(partial) {
  return {
    id: partial.id || "job-1",
    status: partial.status,
    candidate_key: Object.prototype.hasOwnProperty.call(partial, "candidate_key")
      ? partial.candidate_key
      : ROW.candidate_key,
    connector_id: Object.prototype.hasOwnProperty.call(partial, "connector_id")
      ? partial.connector_id
      : "mops_tw",
    created_at: partial.created_at || "2026-07-01T00:00:00Z",
    updated_at: partial.updated_at || partial.created_at || "2026-07-01T00:00:00Z",
    error: partial.error || "",
    result: partial.result || {},
    registered_dataset_id: Object.prototype.hasOwnProperty.call(partial, "registered_dataset_id")
      ? partial.registered_dataset_id
      : null,
    plan: partial.plan || { title: "MOPS financial statements" },
    request: partial.request || {},
  };
}

describe("exact candidate↔job linkage", () => {
  it("links by exact candidate_key", () => {
    const jobs = [job({ status: "queued", candidate_key: ROW.candidate_key })];
    assert.equal(exactJobsForCandidate(ROW, jobs).length, 1);
  });

  it("does not link title-only similar job", () => {
    const jobs = [
      job({
        status: "pending_approval",
        candidate_key: null,
        connector_id: null,
        plan: { title: "MOPS financial statements" },
      }),
    ];
    assert.equal(exactJobsForCandidate(ROW, jobs).length, 0);
    assert.equal(selectLifecycleJob(ROW, jobs), null);
  });

  it("prefers active nonterminal over older terminal", () => {
    const jobs = [
      job({
        id: "old-failed",
        status: "failed",
        updated_at: "2026-07-01T00:00:00Z",
        error: "boom",
      }),
      job({
        id: "active",
        status: "running",
        updated_at: "2026-07-02T00:00:00Z",
      }),
    ];
    assert.equal(selectLifecycleJob(ROW, jobs).id, "active");
  });

  it("uses newest exact terminal when no active job", () => {
    const jobs = [
      job({
        id: "older",
        status: "failed",
        updated_at: "2026-07-01T00:00:00Z",
        error: "a",
      }),
      job({
        id: "newer",
        status: "completed",
        updated_at: "2026-07-03T00:00:00Z",
        registered_dataset_id: null,
      }),
    ];
    assert.equal(selectLifecycleJob(ROW, jobs).id, "newer");
  });
});

describe("classifyJobLifecycle", () => {
  it("approval-required only from pending_approval", () => {
    const c = classifyJobLifecycle(job({ status: "pending_approval" }));
    assert.equal(c.state, LIFECYCLE.APPROVAL_REQUIRED);
    assert.equal(c.primaryAction.id, "review_approval");
  });

  it("queued is not running", () => {
    const c = classifyJobLifecycle(job({ status: "queued" }));
    assert.equal(c.state, LIFECYCLE.QUEUED);
    assert.notEqual(c.state, LIFECYCLE.RUNNING);
  });

  it("running does not invent percentage", () => {
    const c = classifyJobLifecycle(
      job({
        status: "running",
        result: { stage: "Downloading files" },
        updated_at: "2026-07-10T14:32:00Z",
      }),
    );
    assert.equal(c.state, LIFECYCLE.RUNNING);
    assert.ok(c.evidence.some((e) => e.label === "Stage"));
    assert.equal(
      c.evidence.some((e) => /%|percent/i.test(e.label + e.value)),
      false,
    );
  });

  it("failed remains failed with summary", () => {
    const c = classifyJobLifecycle(job({ status: "failed", error: "HTTP 403 from source" }));
    assert.equal(c.state, LIFECYCLE.FAILED);
    assert.match(c.explanation, /403/);
  });

  it("completed without registered_dataset_id = registration pending", () => {
    const c = classifyJobLifecycle(job({ status: "completed", registered_dataset_id: null }));
    assert.equal(c.state, LIFECYCLE.COMPLETED_UNREGISTERED);
  });

  it("registered_dataset_id = Registered in lab", () => {
    const c = classifyJobLifecycle(
      job({ status: "completed", registered_dataset_id: "mops_financial_statements_2026" }),
      { catalog: [{ dataset_id: "mops_financial_statements_2026" }] },
    );
    assert.equal(c.state, LIFECYCLE.REGISTERED);
    assert.equal(c.primaryAction.id, "open_library");
  });

  it("registered without query readiness is not Query ready", () => {
    const c = classifyJobLifecycle(
      job({ status: "completed", registered_dataset_id: "mops_financial_statements_2026" }),
      {
        catalog: [
          {
            dataset_id: "mops_financial_statements_2026",
            analysis_readiness: "metadata_search",
          },
        ],
      },
    );
    assert.equal(c.state, LIFECYCLE.REGISTERED);
    assert.notEqual(c.state, LIFECYCLE.QUERY_READY);
  });

  it("registered query-ready asset = In lab · Query ready", () => {
    const c = classifyJobLifecycle(
      job({ status: "completed", registered_dataset_id: "mops_panel" }),
      {
        catalog: [{ dataset_id: "mops_panel", analysis_readiness: "instant" }],
      },
    );
    assert.equal(c.state, LIFECYCLE.QUERY_READY);
    assert.equal(c.label, "In lab · Query ready");
  });
});

describe("buildDiscoverLifecycle", () => {
  it("submitting disables premature queued claim", () => {
    const life = buildDiscoverLifecycle({ row: ROW, jobs: [], submitting: true });
    assert.equal(life.state, LIFECYCLE.SUBMITTING);
  });

  it("failed exact job stays visible over acquisition default", () => {
    const life = buildDiscoverLifecycle({
      row: ROW,
      jobs: [job({ status: "failed", error: "timeout" })],
    });
    assert.equal(life.state, LIFECYCLE.FAILED);
  });

  it("refresh failure preserves last known state", () => {
    const lastKnown = buildDiscoverLifecycle({
      row: ROW,
      jobs: [job({ status: "running" })],
    });
    const life = buildDiscoverLifecycle({
      row: ROW,
      jobs: [],
      refreshFailed: true,
      lastKnown,
    });
    assert.equal(life.state, LIFECYCLE.RUNNING);
    assert.equal(life.refreshFailed, true);
  });
});
