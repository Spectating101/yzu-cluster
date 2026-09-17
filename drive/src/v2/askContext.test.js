import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { askDatasetForSurface } from "./askContext.js";
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
