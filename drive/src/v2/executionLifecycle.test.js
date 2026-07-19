import assert from "node:assert/strict";
import test from "node:test";

import {
  executionSortPriority,
  isExecutionVisible,
  normalizeExecutionLifecycle,
} from "./executionLifecycle.js";
import { buildRunningRows } from "./resourcesLedger.js";

test("normalizes a running cluster job without inventing progress", () => {
  const result = normalizeExecutionLifecycle({
    id: "job-17",
    status: "executing",
    assigned_worker: "asus-02",
    worker_pool: "windows_lab",
  });

  assert.equal(result.stage, "running");
  assert.equal(result.label, "running");
  assert.equal(result.progress, null);
  assert.equal(result.detail, "worker asus-02");
  assert.equal(result.proof.run_id, "job-17");
  assert.equal(result.proof.pool, "windows_lab");
  assert.equal(result.visible, true);
});

test("uses explicit bounded progress and preserves output proof", () => {
  const result = normalizeExecutionLifecycle({
    id: "job-18",
    lifecycle: {
      stage: "verifying",
      progress: { current: 3, total: 4 },
      worker: { name: "optiplex" },
      outputs: [{ dataset_id: "twse_panel_v2" }],
      events: [
        { event_type: "START", timestamp: "2026-07-19T09:00:00Z" },
        { event_type: "validating", timestamp: "2026-07-19T09:05:00Z" },
      ],
    },
  });

  assert.equal(result.stage, "validating");
  assert.equal(result.progress, 75);
  assert.equal(result.detail, "worker optiplex · 1 output");
  assert.deepEqual(result.proof.outputs, ["twse_panel_v2"]);
  assert.equal(result.proof.event_count, 2);
});

test("surfaces failed and blocked jobs as attention items", () => {
  const failed = normalizeExecutionLifecycle({ status: "error", attempt: 2 });
  const blocked = normalizeExecutionLifecycle({ status: "stalled" });

  assert.equal(failed.stage, "failed");
  assert.equal(failed.warn, true);
  assert.match(failed.detail, /attempt 2/);
  assert.equal(blocked.stage, "blocked");
  assert.equal(isExecutionVisible(blocked), true);
  assert.equal(executionSortPriority(failed), 0);
});

test("does not keep completed work in the active Resources list", () => {
  const completed = normalizeExecutionLifecycle({ status: "succeeded" });
  assert.equal(completed.stage, "completed");
  assert.equal(completed.visible, false);
  assert.equal(isExecutionVisible({ status: "completed" }), false);
});

test("Resources rows expose worker, explicit progress, and failed jobs", () => {
  const rows = buildRunningRows({
    jobs: [
      {
        id: "job-running",
        status: "running",
        assigned_worker: "asus-03",
        progress: { current: 2, total: 5 },
        plan: { title: "Collect MOPS filings" },
      },
      {
        id: "job-failed",
        status: "failed",
        attempt: 3,
        type: "scraper_run",
      },
      { id: "job-done", status: "completed", type: "archive_upload" },
    ],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].key, "job-job-failed");
  assert.equal(rows[0].warn, true);
  assert.equal(rows[0].detail, "attempt 3");
  assert.equal(rows[1].label, "Collect MOPS filings");
  assert.equal(rows[1].detail, "worker asus-03");
  assert.equal(rows[1].progress, 40);
  assert.equal(rows[1].lifecycle.proof.worker, "asus-03");
});
