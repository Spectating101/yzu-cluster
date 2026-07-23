import test from "node:test";
import assert from "node:assert/strict";
import { buildResourcesPanels } from "./resourcesFromRollup.js";

test("rollupLoading keeps stable source structure from local manifest", () => {
  const panels = buildResourcesPanels({
    rollup: undefined,
    rollupLoading: true,
    health: null,
    ops: null,
    jobs: [],
    catalogSummary: null,
    cluster: null,
  });

  assert.ok(panels.providers.length > 0, "providers should render from desk_sources.json while syncing");
  assert.ok(panels.layers.length > 0, "layers should render from desk_sources.json while syncing");
  assert.equal(panels.connect.source_count, panels.providers.length);
  assert.ok(panels.providers.every((row) => row.kind === "source"));
  assert.ok(panels.providers.some((row) => row.key === "source-sec_edgar"));
});

test("rollupLoading without rollup does not invent live usage or metered values", () => {
  const panels = buildResourcesPanels({
    rollup: undefined,
    rollupLoading: true,
  });

  assert.deepEqual(panels.usage, []);
  assert.deepEqual(panels.metered, []);
  assert.equal(panels.hero, null);
  assert.equal(panels.offline, false);
});

test("last-known rollup still hydrates live panels while a refresh is marked loading", () => {
  const panels = buildResourcesPanels({
    rollupLoading: true,
    rollup: {
      hero: { query_engine: { up: true, port: 8765 }, workers: { busy: 1, total: 4 }, vault: {} },
      ai: { composer_model: "composer-2.5", composer_configured: true, mcp_tools: { total: 3, core: 1, acquire: 1, ops: 1 } },
      metered: { bigquery: { configured: true }, tavily: { keys_loaded: 1 } },
      usage: { vault: { used_tb: 2.1, cap_tb: 5, pct: 42 } },
    },
  });

  assert.ok(panels.providers.length > 0);
  assert.ok(panels.usage.length > 0);
  assert.ok(panels.metered.length > 0);
  assert.equal(panels.hero?.queryEngine?.up, true);
});
