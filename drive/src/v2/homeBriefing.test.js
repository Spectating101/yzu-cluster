import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeBriefing } from "./homeBriefing.js";

test("home briefing derives judgment from pending jobs only", () => {
  const briefing = buildHomeBriefing({
    datasets: [],
    jobs: [{ id: "job-1", title: "MOPS financial statements", status: "pending_approval" }],
    health: { status: "ok", desk: { jobs: { pending_approval: 1, running: 0 } } },
  });
  assert.equal(briefing.needsJudgment.length, 1);
  assert.equal(briefing.needsJudgment[0].kind, "approval");
  assert.match(briefing.needsJudgment[0].title, /MOPS/);
  assert.equal(briefing.empty.continue, true);
});

test("home briefing continues from catalog when recent list is empty", () => {
  const briefing = buildHomeBriefing({
    datasets: [{ dataset_id: "a", name: "Panel A", analysis_readiness: "instant" }],
    jobs: [],
  });
  assert.equal(briefing.continueWork?.id, "a");
  assert.equal(briefing.empty.continue, false);
});

test("home briefing does not invent gap chips without profile recommendations", () => {
  const briefing = buildHomeBriefing({
    datasets: [{ dataset_id: "a", name: "Panel A", analysis_readiness: "instant" }],
    jobs: [],
    health: { status: "ok", desk: { jobs: {} } },
    profile: null,
  });
  assert.ok(briefing.nextActions.every((action) => !/TWSE|MOPS filings|stablecoin/i.test(action.label)));
  assert.ok(briefing.nextActions.some((action) => /Library|Continue|Browse/i.test(action.label)));
});

test("home briefing marks evidence freshness unknown when timestamps are absent", () => {
  const briefing = buildHomeBriefing({
    datasets: [{ dataset_id: "a", name: "Panel A", analysis_readiness: "instant" }],
    jobs: [],
  });
  assert.equal(briefing.evidence.length, 1);
  assert.equal(briefing.evidence[0].freshnessUnknown, true);
});

test("home briefing includes profile search recommendations as actions", () => {
  const briefing = buildHomeBriefing({
    datasets: [],
    jobs: [],
    profile: {
      procurement_recommendations: [{ search_query: "TWSE governance" }],
    },
  });
  assert.ok(briefing.nextActions.some((action) => action.searchQuery === "TWSE governance"));
});
