import assert from "node:assert/strict";
import test from "node:test";
import { MOCK_RESOURCES_ROLLUP } from "../../../e2e/fixtures/mockResourcesRollup.js";
import { buildFallbackPanels, buildResourcesPanels } from "./resourcesFromRollup.js";

test("query engine projects as Workers & query / Query service, not AI & tools", () => {
  const panels = buildResourcesPanels({ rollup: MOCK_RESOURCES_ROLLUP });

  assert.ok(
    panels.ai.every((row) => row.key !== "query-engine"),
    "query engine must leave the AI panel",
  );
  assert.ok(
    panels.ai.every((row) => /composer|mcp|desk-token|composer-turns/i.test(row.key || "")),
    "AI panel keeps composer/model-adjacent rows only",
  );
  assert.ok(panels.ai.every((row) => row.section === "AI & tools"));
  assert.ok(panels.ai.some((row) => row.key === "composer"));

  const queryEngine = panels.compute.find((row) => row.key === "query-engine");
  assert.ok(queryEngine, "query engine belongs with workers/compute facts");
  assert.match(queryEngine.section, /Workers & query/i);
  assert.equal(queryEngine.detail, "Catalog and query service");
  assert.notEqual(queryEngine.detail, "Query service");
  assert.notEqual(queryEngine.kind, "ai");
  assert.equal(/AI/i.test(queryEngine.section), false);
});

test("fallback panels also keep query engine out of AI & tools", () => {
  const panels = buildFallbackPanels({
    health: { status: "ok", desk: { desk_token_required: true, composer_configured: true } },
  });
  assert.ok(panels.ai.every((row) => row.key !== "query-engine"));
  const queryEngine = panels.compute.find((row) => row.key === "query-engine");
  assert.ok(queryEngine);
  assert.match(queryEngine.section, /Workers & query|Query service/i);
  assert.notEqual(queryEngine.kind, "ai");
});
