import test from "node:test";
import assert from "node:assert/strict";
import {
  RESOURCES_ROLLUP_CACHE_KEY,
  readResourcesRollupCache,
  writeResourcesRollupCache,
} from "./resourcesRollupCache.js";

test("resources rollup cache round-trips last-known payload", () => {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  assert.equal(readResourcesRollupCache(), null);
  writeResourcesRollupCache({ hero: { workers: { busy: 2, total: 12 } }, usage: { vault: { used_tb: 1 } } });
  const cached = readResourcesRollupCache();
  assert.equal(cached.hero.workers.busy, 2);
  assert.equal(cached.usage.vault.used_tb, 1);
  assert.equal(store.has(RESOURCES_ROLLUP_CACHE_KEY), true);

  writeResourcesRollupCache(null);
  assert.equal(readResourcesRollupCache(), null);
});

test("resources rollup cache ignores corrupt JSON", () => {
  globalThis.sessionStorage = {
    getItem: () => "{not-json",
    setItem: () => {},
    removeItem: () => {},
  };
  assert.equal(readResourcesRollupCache(), null);
});
