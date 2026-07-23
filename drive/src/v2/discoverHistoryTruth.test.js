import assert from "node:assert/strict";
import test from "node:test";
import { historyEventForJob } from "./discoverAdapters.js";

test("historyEventForJob prefers durable history id match", () => {
  const events = [
    {
      id: "hist-1",
      target: "MOPS financial statements",
      meta: { job_id: "job-pending-1", status: "pending_approval" },
      status: "pending_approval",
    },
  ];
  const match = historyEventForJob(events, { id: "job-pending-1", status: "pending_approval" });
  assert.equal(match.id, "hist-1");
  assert.equal(match.meta.job_id, "job-pending-1");
});

test("historyEventForJob synthesizes a durable job history object when missing", () => {
  const match = historyEventForJob([], {
    id: "job-9",
    status: "failed",
    plan: { title: "TWSE daily quotes" },
  });
  assert.equal(match.id, "job-9");
  assert.equal(match.meta.job_id, "job-9");
  assert.match(match.target, /TWSE/);
  assert.equal(match.durable, true);
});
