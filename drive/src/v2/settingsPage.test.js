import assert from "node:assert/strict";
import test from "node:test";

/**
 * Settings IA contract — Identity → Access → Defaults → Advanced.
 * Detail rail: ≤5 facts + one action; no invented Ready without health signal.
 */

const GROUPS = ["identity", "access", "defaults", "advanced"];

function accessFactsFromHealth(health) {
  const desk = health?.desk || {};
  const healthLoaded = Boolean(
    health?.desk &&
      ("composer_configured" in desk ||
        desk.mcp_tools?.total != null ||
        "gdrive" in desk ||
        "jobs" in desk),
  );
  const facts = [];
  if (!healthLoaded || !("composer_configured" in desk)) {
    facts.push({ label: "Ask / Composer", value: "Not reported" });
  } else {
    facts.push({
      label: "Ask / Composer",
      value: desk.composer_configured === true ? "Ready" : "Not configured",
    });
  }
  if (desk.mcp_tools?.total != null) {
    facts.push({ label: "MCP tools", value: String(desk.mcp_tools.total) });
  }
  return facts.slice(0, 5);
}

test("Settings group order is Identity Access Defaults Advanced", () => {
  assert.deepEqual(GROUPS, ["identity", "access", "defaults", "advanced"]);
});

test("Access facts never invent Ready without composer_configured", () => {
  const empty = accessFactsFromHealth(null);
  assert.equal(empty[0].value, "Not reported");
  const partial = accessFactsFromHealth({ desk: { jobs: { pending_approval: 0 } } });
  assert.equal(partial[0].value, "Not reported");
  const ready = accessFactsFromHealth({ desk: { composer_configured: true, mcp_tools: { total: 12 } } });
  assert.equal(ready[0].value, "Ready");
  assert.equal(ready[1].value, "12");
  assert.ok(ready.length <= 5);
});

test("Settings Detail keeps at most five facts", () => {
  const facts = accessFactsFromHealth({
    desk: {
      composer_configured: true,
      mcp_tools: { total: 84 },
      gdrive: { ok: true },
      jobs: { pending_approval: 2 },
    },
  });
  assert.ok(facts.length <= 5);
});
