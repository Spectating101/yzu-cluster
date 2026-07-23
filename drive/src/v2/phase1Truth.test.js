import test from "node:test";
import assert from "node:assert/strict";
import {
  fenceHistoryEvents,
  isDeskSearchTelemetry,
  isHistoryNoise,
} from "./historyNoiseFence.js";
import {
  countOpsAttention,
  resourcesOpsPosture,
  resourcesOpsPill,
} from "./attentionModel.js";
import {
  classifyAskIntent,
  shapeAskReplyForIntent,
} from "./askIntent.js";

test("history noise fence hides triage fixture recovery spam", () => {
  const events = [
    {
      id: "noise-1",
      target: "raw_usdt_history",
      summary: "triage noise: fixture_http_manifest_stuck",
      status: "failed",
      ts: "2026-07-20T21:00:00Z",
    },
    {
      id: "noise-2",
      target: "raw_usdt_history",
      summary: "triage noise: fixture_http_manifest_stuck",
      status: "failed",
      ts: "2026-07-20T21:00:01Z",
    },
    {
      id: "real-1",
      target: "GDELT Asia panel refresh",
      summary: "Registered into lab vault",
      status: "registered",
      ts: "2026-07-20T22:00:00Z",
    },
  ];
  assert.equal(isHistoryNoise(events[0]), true);
  const fenced = fenceHistoryEvents(events);
  assert.equal(fenced.hiddenNoise, 2);
  assert.equal(fenced.visible.length, 1);
  assert.equal(fenced.visible[0].id, "real-1");
});

test("history noise fence hides deploy smoke jobs", () => {
  assert.equal(
    isHistoryNoise({ title: "day2 deploy smoke: http_manifest", status: "completed" }),
    true,
  );
  assert.equal(
    isHistoryNoise({ title: "post-merge main smoke: http_manifest", status: "completed" }),
    true,
  );
  assert.equal(
    isHistoryNoise({ title: "RFC 9110 HTTP Semantics", status: "completed" }),
    false,
  );
});

test("history fence keeps Ask/search telemetry off the default durable trail", () => {
  const events = [
    {
      id: "ask-1",
      action: "ask",
      target: "Find USDT panels",
      summary: "Ask turn",
      ts: "2026-07-20T22:00:00Z",
    },
    {
      id: "search-1",
      action: "search",
      target: "stablecoin",
      summary: "Raw search",
      ts: "2026-07-20T22:01:00Z",
    },
    {
      id: "collect-1",
      action: "collection_run",
      durable: true,
      target: "GDELT Asia panel",
      summary: "Collecting",
      status: "running",
      ts: "2026-07-20T22:02:00Z",
    },
  ];
  assert.equal(isDeskSearchTelemetry(events[0]), true);
  assert.equal(isDeskSearchTelemetry(events[2]), false);
  const fenced = fenceHistoryEvents(events);
  assert.equal(fenced.visible.length, 1);
  assert.equal(fenced.visible[0].id, "collect-1");
  assert.equal(fenced.hiddenSearchTelemetry, 2);
  assert.equal(fenced.searchTelemetry.length, 2);
});

test("history fence collapses duplicate durable rows", () => {
  const events = [
    {
      id: "a",
      target: "Same journey",
      summary: "Collecting",
      status: "running",
      ts: "2026-07-20T22:00:00Z",
    },
    {
      id: "b",
      target: "Same journey",
      summary: "Collecting",
      status: "running",
      ts: "2026-07-20T21:00:00Z",
    },
  ];
  const fenced = fenceHistoryEvents(events);
  assert.equal(fenced.visible.length, 1);
  assert.equal(fenced.collapsedDuplicates, 1);
});

test("resources ops posture does not say need attention", () => {
  const counts = countOpsAttention({
    issues: new Array(47).fill({}),
    jobs: { pending_approval: 0, failed: 0, running: 0 },
  });
  const posture = resourcesOpsPosture(counts);
  assert.match(posture, /47 capacity warnings/);
  assert.doesNotMatch(posture, /need attention/i);
  assert.equal(resourcesOpsPill(counts, true).label, "Ops");
});

test("ops attention prefers failed_actionable over lifetime failed", () => {
  const counts = countOpsAttention({
    issues: [],
    jobs: {
      failed: 11,
      failed_recent: 11,
      failed_actionable: 6,
      pending_approval: 0,
      running: 0,
    },
  });
  assert.equal(counts.failedJobs, 6);
});

test("status ask intent strips Queue DOI / DESCRIBE_DATASET affordances", () => {
  assert.equal(classifyAskIntent("Status only: reply with OK"), "status");
  const shaped = shapeAskReplyForIntent("status", {
    action: "collect_doi",
    toolName: "DESCRIBE_DATASET",
    pendingJobId: "job-1",
    jobStatus: "pending_approval",
    suggestedPrompts: ["Queue DOI collect for gdelt_asia", "Explain readiness"],
  });
  assert.equal(shaped.action, null);
  assert.equal(shaped.toolName, null);
  assert.equal(shaped.pendingJobId, null);
  assert.deepEqual(shaped.suggestedPrompts, ["Explain readiness"]);
});

test("cancelled history rows are not Collecting", async () => {
  const { historyLifecycleBucket } = await import("./discoverAdapters.js");
  assert.equal(
    historyLifecycleBucket({ status: "cancelled", action: "collection_run", target: "Synthesis boundary" }),
    "ready",
  );
});
