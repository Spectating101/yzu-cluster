import test from "node:test";
import assert from "node:assert/strict";
import { resolveSurfaceLifecycle, SURFACE_LIFECYCLE } from "./surfaceLifecycle.js";

test("surface lifecycle covers the seven product states", () => {
  assert.deepEqual(SURFACE_LIFECYCLE, ["idle", "loading", "partial", "ready", "empty", "stale", "error"]);
  assert.equal(resolveSurfaceLifecycle({ idle: true }), "idle");
  assert.equal(resolveSurfaceLifecycle({ loading: true }), "loading");
  assert.equal(resolveSurfaceLifecycle({ loading: true, count: 2 }), "partial");
  assert.equal(resolveSurfaceLifecycle({ count: 2 }), "ready");
  assert.equal(resolveSurfaceLifecycle({ count: 0 }), "empty");
  assert.equal(resolveSurfaceLifecycle({ error: "offline", count: 2 }), "stale");
  assert.equal(resolveSurfaceLifecycle({ error: "offline" }), "error");
});

test("failure outranks loading so a settled fault never looks busy forever", () => {
  assert.equal(resolveSurfaceLifecycle({ loading: true, error: "timeout" }), "error");
  assert.equal(resolveSurfaceLifecycle({ loading: true, error: "timeout", count: 1 }), "stale");
});
