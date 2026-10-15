import assert from "node:assert/strict";
import { test } from "node:test";
import { requestCounts } from "./requestCounts.js";

test("collection requests are counted by what the researcher waits on", () => {
  const jobs = [{ status: "pending_approval" }, { status: "running" }, { status: "queued" }, { status: "completed" }, { status: "failed" }, { status: "cancelled" }];
  assert.deepEqual(requestCounts(jobs), { waiting: 1, running: 2, ready: 1, failed: 1 });
  assert.deepEqual(requestCounts(null), { waiting: 0, running: 0, ready: 0, failed: 0 });
});
