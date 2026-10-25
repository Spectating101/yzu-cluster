import test from "node:test";
import assert from "node:assert/strict";
import { matchLibraryInputs } from "./libraryInputPicker.js";

const catalog = [
  { dataset_id: "crypto_majors_daily_10y", display_name: "Major cryptocurrency daily prices (10y)", grain: "instrument_date", keywords: ["bitcoin", "ethereum"], analysis_readiness: "instant", one_line: "Daily close prices for ten coins." },
  { dataset_id: "craft_co2", display_name: "Mauna Loa Monthly CO₂ Concentrations", grain: "month", materialization: { query_ready: true } },
  { dataset_id: "crsp_us_stock_monthly_ciz", display_name: "CRSP U.S. stock monthly file", grain: "permno_month", analysis_readiness: "instant" },
];

test("matches every word across name, keywords and description, best name match first", () => {
  const rows = matchLibraryInputs(catalog, "bitcoin daily");
  assert.deepEqual(rows.map((r) => r.datasetId), ["crypto_majors_daily_10y"]);
  assert.equal(rows[0].ready, true);
  assert.equal(rows[0].grain, "instrument × date");
});

test("prefix words match and mapped inputs are left out", () => {
  assert.deepEqual(matchLibraryInputs(catalog, "mauna").map((r) => r.datasetId), ["craft_co2"]);
  assert.deepEqual(matchLibraryInputs(catalog, "mauna", { exclude: ["craft_co2"] }), []);
  assert.deepEqual(matchLibraryInputs(catalog, "crsp stock").map((r) => r.datasetId), ["crsp_us_stock_monthly_ciz"]);
});

test("an empty or one-letter query lists nothing", () => {
  assert.deepEqual(matchLibraryInputs(catalog, ""), []);
  assert.deepEqual(matchLibraryInputs(catalog, "a"), []);
});
