const publicSources = new Set([
  "fred_observations", "bls_laus_county", "world_bank_indicators", "census_acs5",
  "ken_french_factors", "sec_companyfacts", "imf_datamapper", "eurostat_dataset",
  "ecb_series", "oecd_sdmx", "binance_klines", "singstat_table",
]);
export function collectionRecipe(dataset) {
  const recipe = dataset?.collection_recipe || {
    source_id: dataset?.source_id, request: dataset?.coverage?.requested,
  };
  return publicSources.has(recipe.source_id) && recipe.request && typeof recipe.request === "object"
    && !Array.isArray(recipe.request) ? recipe : null;
}
