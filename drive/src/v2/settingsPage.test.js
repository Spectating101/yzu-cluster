import assert from "node:assert/strict";
import test from "node:test";
test("Settings group order is Identity Access Defaults Advanced", () => {
  assert.deepEqual(["identity", "access", "defaults", "advanced"], ["identity", "access", "defaults", "advanced"]);
});
