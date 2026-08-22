import assert from "node:assert/strict";
import test from "node:test";

import { composerRuntimeRead } from "./composerRuntimeStatus.js";
import { projectRollupFromHealth, buildResourceHeadroom } from "./homeIteration10.js";

const STATUSES = ["ready", "degraded", "stale", "unverified", "unavailable", "weird_new_status"];

function healthWith(status) {
  return {
    desk: {
      composer_configured: true,
      composer_model: "composer-2.5",
      composer_runtime: status == null ? null : { status },
    },
  };
}

function cursorSlot(status) {
  const rollup = projectRollupFromHealth(healthWith(status));
  assert.ok(rollup, `rollup should project for status ${status}`);
  const slots = buildResourceHeadroom(rollup);
  return slots.find((s) => s.id === "cursor");
}

test("Home carries composer_runtime through the projection", () => {
  for (const status of STATUSES) {
    const rollup = projectRollupFromHealth(healthWith(status));
    assert.equal(rollup.hero.composer.runtime?.status, status);
    assert.equal(rollup.ai.composer_runtime?.status, status);
  }
});

test("Home never claims readiness the desk has not observed", () => {
  for (const status of STATUSES) {
    const slot = cursorSlot(status);
    assert.ok(slot, `cursor slot missing for ${status}`);
    const shared = composerRuntimeRead({ status });
    if (!shared.ready) {
      assert.equal(
        /ready/i.test(slot.metric),
        false,
        `Home said "${slot.metric}" while the shared contract said ${shared.short} for status=${status}`,
      );
    }
  }
});

test("Home agrees with the shared contract on the warn flag", () => {
  for (const status of STATUSES) {
    const slot = cursorSlot(status);
    assert.equal(
      Boolean(slot.warn),
      Boolean(composerRuntimeRead({ status }).warn),
      `warn flag diverged for status=${status}`,
    );
  }
});

test("a configured key with no probe is not reported as ready", () => {
  const slot = cursorSlot(null);
  assert.ok(slot);
  assert.equal(/ready/i.test(slot.metric), false);
  assert.equal(slot.warn, true);
});

test("Home mirrors the shared short label verbatim", () => {
  for (const status of STATUSES) {
    assert.equal(cursorSlot(status).metric, composerRuntimeRead({ status }).short);
  }
});
