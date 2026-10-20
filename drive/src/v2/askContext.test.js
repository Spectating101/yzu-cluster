import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { askDatasetForSurface, homeConversationOverride } from "./askContext.js";
import { activeObjectBelongsToTab } from "./contextOwnership.js";

const gdelt = {
  dataset_id: "gdelt_asia_daily_country_panel",
  title: "GDELT news shocks in Asia",
  analysis_readiness: "instant",
  vault_path: "Library / GDELT",
};
const staleCandidate = {
  kind: "external_candidate",
  id: "gdelt",
  title: gdelt.title,
  row: gdelt,
};

describe("Ask surface context ownership", () => {
  it("does not carry a Discover selection into Resources", () => {
    assert.deepEqual(
      askDatasetForSurface({
        tab: "resources",
        detail: gdelt,
        activeObject: staleCandidate,
      }),
      { title: "Resources · Research capacity" },
    );

    assert.equal(activeObjectBelongsToTab("resources", staleCandidate), false);
  });

  it("keeps selected evidence on the surface that owns it", () => {
    assert.equal(activeObjectBelongsToTab("browse", staleCandidate), true);

    const libraryObject = {
      kind: "dataset",
      id: gdelt.dataset_id,
      title: gdelt.title,
      row: gdelt,
    };
    assert.equal(activeObjectBelongsToTab("library", libraryObject), true);
    assert.deepEqual(
      askDatasetForSurface({ tab: "library", detail: gdelt, activeObject: libraryObject }),
      gdelt,
    );
  });
});

it("Discover objects keep their Ask context under either tab spelling", () => {
  const object = { kind: "discover_history", id: "e1", title: "TWSE refresh" };
  assert.equal(activeObjectBelongsToTab("discover", object), true);
  assert.equal(activeObjectBelongsToTab("browse", object), true);
  assert.equal(activeObjectBelongsToTab("library", object), false);
});

it("passive Home hydration keeps the conversation while explicit attention remains separate", () => {
  for (const id of ["request-one", "request-two"]) {
    const dataset = askDatasetForSurface({
      tab: "home",
      activeObject: { kind: "home_attention", id, title: "Pending request", passive: true },
    });
    assert.equal(homeConversationOverride("home", dataset), "home");
  }
  const deliberate = askDatasetForSurface({
    tab: "home",
    activeObject: { kind: "home_attention", id: "request-one", title: "Pending request" },
  });
  assert.equal(homeConversationOverride("home", deliberate), "");
  assert.equal(homeConversationOverride("home", gdelt), "home");
  assert.equal(homeConversationOverride("library", gdelt), "");
});
