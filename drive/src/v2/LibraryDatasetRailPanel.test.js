import test from "node:test";
import assert from "node:assert/strict";
import { canIUseDecision, statusPillKind } from "./datasetMeta.js";

test("registered datasets never fall through to Readiness unknown", () => {
  const decision = canIUseDecision({
    dataset_id: "day2_deploy_smoke_20260720",
    analysis_readiness: "registered",
  });
  assert.equal(statusPillKind({ analysis_readiness: "registered" }).label, "Registered");
  assert.equal(decision.headline, "Registered");
  assert.match(decision.body, /archived research asset/i);
  assert.match(decision.body, /querying has not yet been proven/i);
  assert.doesNotMatch(decision.headline, /unknown/i);
});

test("registered scholarly work uses bibliographic semantics instead of query semantics", () => {
  const decision = canIUseDecision({
    dataset_id: "paper",
    asset_kind: "scholarly_work",
    analysis_readiness: "registered",
  });
  assert.equal(decision.headline, "Registered");
  assert.match(decision.body, /reusable scholarly work/i);
  assert.match(decision.body, /source verification remains a separate claim/i);
  assert.doesNotMatch(decision.body, /querying/i);
});

test("registered operational records use recorded-state semantics", () => {
  const decision = canIUseDecision({
    dataset_id: "manifest",
    asset_kind: "operational",
    analysis_readiness: "registered",
  });
  assert.equal(decision.headline, "Registered");
  assert.match(decision.body, /reusable operational record/i);
  assert.match(decision.body, /recorded evidence/i);
  assert.doesNotMatch(decision.body, /querying/i);
});

test("query ready remains distinct from registered", () => {
  const ready = canIUseDecision({ analysis_readiness: "instant" });
  assert.equal(ready.headline, "Query ready");
  const registered = canIUseDecision({ analysis_readiness: "registered" });
  assert.notEqual(registered.headline, ready.headline);
});
