import assert from "node:assert/strict";
import test from "node:test";

import { measuredComposerLabel, rollupIsMeasured, unmeasuredResourcesPanels } from "./resourcesTruth.js";

test("composer label does not invent a model name", () => {
  assert.equal(measuredComposerLabel(""), "Not reported");
  assert.equal(measuredComposerLabel(null), "Not reported");
  assert.equal(measuredComposerLabel("composer-2.5"), "composer-2.5");
});

test("placeholder rollup is not treated as a measurement", () => {
  assert.equal(rollupIsMeasured(null), false);
  assert.equal(rollupIsMeasured({ _placeholder: true }), false);
  assert.equal(rollupIsMeasured({ ai: {} }), true);
  assert.equal(unmeasuredResourcesPanels().unmeasured, true);
});
