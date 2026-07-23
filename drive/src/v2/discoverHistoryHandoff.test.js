import assert from "node:assert/strict";
import test from "node:test";
import { historyEventForJob, mergeHistoryEvents } from "./discoverAdapters.js";

test("historyEventForJob selects the durable History object for a job id", () => {
  const events = mergeHistoryEvents(
    [
      {
        id: "hist-job-pending-1",
        target: "MOPS financial statements",
        meta: { job_id: "job-pending-1", status: "pending_approval" },
        status: "pending_approval",
      },
    ],
    [],
  );
  const match = historyEventForJob(events, {
    id: "job-pending-1",
    plan: { title: "MOPS financial statements" },
  });
  assert.equal(match.id, "hist-job-pending-1");
  assert.equal(match.meta.job_id, "job-pending-1");
});

test("historyEventForJob synthesizes a History-shaped object when ledger has no row yet", () => {
  const match = historyEventForJob([], {
    id: "job-recovery-9",
    status: "failed",
    plan: { title: "Blocked harvest" },
  });
  assert.equal(match.id, "job-recovery-9");
  assert.equal(match.meta.job_id, "job-recovery-9");
  assert.match(String(match.target), /Blocked harvest/);
});
