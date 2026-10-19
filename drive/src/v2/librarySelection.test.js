import test from "node:test";
import assert from "node:assert/strict";
import { resolveLibrarySelection } from "./librarySelection.js";

test("no selected id stays on the folder tree", () => {
  assert.equal(
    resolveLibrarySelection({
      selectedId: "",
      holdings: [{ dataset_id: "twse_openapi_taiwan_market_layer" }],
      fallback: { dataset_id: "twse_openapi_taiwan_market_layer" },
    }),
    null,
  );
});

test("holdings match wins over a thinner fallback", () => {
  const held = { dataset_id: "twse_openapi_taiwan_market_layer", name: "From catalog" };
  const resolved = resolveLibrarySelection({
    selectedId: "twse_openapi_taiwan_market_layer",
    holdings: [held],
    fallback: { dataset_id: "twse_openapi_taiwan_market_layer", name: "From describe" },
  });
  assert.equal(resolved, held);
});

test("empty catalog still opens the asset from describe fallback", () => {
  const fallback = { dataset_id: "twse_openapi_taiwan_market_layer", name: "From describe" };
  const resolved = resolveLibrarySelection({
    selectedId: "twse_openapi_taiwan_market_layer",
    holdings: [],
    fallback,
  });
  assert.equal(resolved, fallback);
});

test("library search that drops the row still opens it from unfiltered holdings", () => {
  const held = { dataset_id: "twse_openapi_taiwan_market_layer", name: "TWSE" };
  const resolved = resolveLibrarySelection({
    selectedId: "twse_openapi_taiwan_market_layer",
    holdings: [held],
    fallback: null,
  });
  assert.equal(resolved, held);
});

test("deep-link before catalog or describe still owns the centre", () => {
  const resolved = resolveLibrarySelection({
    selectedId: "twse_openapi_taiwan_market_layer",
    holdings: [],
    fallback: null,
  });
  assert.deepEqual(resolved, { dataset_id: "twse_openapi_taiwan_market_layer" });
});

test("fallback for a different dataset is ignored", () => {
  const resolved = resolveLibrarySelection({
    selectedId: "twse_openapi_taiwan_market_layer",
    holdings: [],
    fallback: { dataset_id: "other_dataset", name: "Wrong" },
  });
  assert.deepEqual(resolved, { dataset_id: "twse_openapi_taiwan_market_layer" });
});
