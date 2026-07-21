import assert from "node:assert/strict";
import test from "node:test";

const GROUPS = ["identity", "access", "defaults", "advanced"];

function accessFactsFromHealth(health) {
  const desk = health?.desk || {};
  const healthLoaded = Boolean(
    health?.desk &&
      ("composer_configured" in desk || desk.mcp_tools?.total != null || "gdrive" in desk || "jobs" in desk),
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
  if (desk.gdrive) {
    facts.push({
      label: "Research archive",
      value: desk.gdrive.ok === true ? "Connected" : "Needs review",
    });
  }
  return facts.slice(0, 5);
}

test("Settings group order is Identity Access Defaults Advanced", () => {
  assert.deepEqual(GROUPS, ["identity", "access", "defaults", "advanced"]);
});

test("Access facts never invent Ready without composer_configured", () => {
  assert.equal(accessFactsFromHealth(null)[0].value, "Not reported");
  const ready = accessFactsFromHealth({ desk: { composer_configured: true, mcp_tools: { total: 12 } } });
  assert.equal(ready[0].value, "Ready");
  assert.ok(!ready.some((f) => /MCP|pending/i.test(f.label)));
});

test("Access facts omit MCP tool and pending approval counts", () => {
  const facts = accessFactsFromHealth({
    desk: { composer_configured: true, mcp_tools: { total: 84 }, gdrive: { ok: true }, jobs: { pending_approval: 2 } },
  });
  assert.ok(!facts.some((f) => /MCP|pending/i.test(f.label)));
  assert.ok(facts.some((f) => f.label === "Research archive"));
});

test("Settings Detail keeps at most five facts", () => {
  assert.ok(accessFactsFromHealth({
    desk: { composer_configured: true, mcp_tools: { total: 84 }, gdrive: { ok: true }, jobs: { pending_approval: 2 } },
  }).length <= 5);
});
