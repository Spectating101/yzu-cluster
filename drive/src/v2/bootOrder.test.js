import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The front door is a ThreadingHTTPServer, but its data endpoints are
 * GIL-bound: measured over 4 concurrent requests, /library/desk/capabilities
 * gains 2.95x while /library/partitions gains 1.32x. Boot order is therefore
 * the lever rather than concurrency.
 *
 * This reads source order, which cannot tell you the desk behaves. It is a
 * fast guard; e2e/boot-recovery.spec.js is the real coverage — it hangs
 * /health and the resources rollup and proves the estate still arrives. App.jsx already documents the policy — establish the visible research
 * estate first, defer aggregate health and operational enrichment — but the
 * navigation fetch ran third, and the Library waited ~13s for shelves the desk
 * had already loaded. Reordering it took time-to-shelves to ~2.6s.
 */
const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "App.jsx"),
  "utf8",
);

const at = (needle) => {
  const i = src.indexOf(needle);
  assert.notEqual(i, -1, `boot call moved or renamed: ${needle}`);
  return i;
};

test("the visible research estate loads before operational enrichment", () => {
  const nav = at("applyNavigation(await listLibraryNav())");
  const resources = at("await deskResources(false)");
  assert.ok(nav < resources, "navigation must not wait behind the resources rollup");
});

test("the visible research estate loads before aggregate health", () => {
  const nav = at("applyNavigation(await listLibraryNav())");
  const health = at("applyHealth(await deskHealth(false");
  assert.ok(nav < health, "navigation must not wait behind /health, which may probe for 12s");
});

test("health paints Home before the slower operational rollup", () => {
  const health = at("applyHealth(await deskHealth(false");
  const resources = at("await deskResources(false)");
  assert.ok(health < resources, "Home status must not wait behind /desk/resources");
});

test("the catalog still leads the boot sequence", () => {
  assert.ok(at("applyCatalog(await listDatasets())") < at("applyNavigation(await listLibraryNav())"));
});

test("deferred enrichment is still fetched, not dropped", () => {
  at("await deskResources(false)");
  at("applyHealth(await deskHealth(false");
  at("listJobs()");
});

test("Copilot priming is optional background work, never boot work", () => {
  const warm = at("void deskWarm({ userEmail: email || undefined, background: true })");
  const backend = at("const refreshBackend = useCallback");
  const visibleEstate = at("applyCatalog(await listDatasets())");
  assert.ok(warm > backend, "warmup must not be folded into refreshBackend");
  assert.ok(warm > visibleEstate, "the visible estate must remain ahead of optional priming");
  at("Warmup is best-effort");
});

test("Ask permission gates both Copilot priming and the Ask rail", () => {
  at("const canUseAsk = Boolean(deskAccess?.permissions?.use_ask)");
  at("if (!deskAccess?.authenticated || !canUseAsk) return undefined;");
  at("canUseAsk ? <AskRail");
  at("assistantAllowed={canUseAsk}");
});

test("public guests receive a sign-in explanation instead of an operator-only denial", () => {
  at('const isPublicGuest = deskAccess?.access === "public_guest";');
  at("Sign in to ask Research Drive.");
  at("saved conversations are available after sign-in.");
});
