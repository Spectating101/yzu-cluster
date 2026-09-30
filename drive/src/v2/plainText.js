const PROPER_NAMES = {
  api: "API", csv: "CSV", http: "HTTP", json: "JSON", bigquery: "BigQuery", ccm: "CCM", coingecko: "CoinGecko", compustat: "Compustat", crsp: "CRSP",
  datacite: "DataCite", doi: "DOI", edgar: "EDGAR", lseg: "LSEG", mops: "MOPS", moveit: "MOVEit",
  openapi: "OpenAPI", refinitiv: "Refinitiv", sec: "SEC", tw: "Taiwan", twse: "TWSE", url: "URL",
  wrds: "WRDS", yfinance: "Yahoo Finance", yzu: "YZU",
};

export function plainIdentifiers(value) {
  return String(value || "")
    .split(" · ")
    .map((part) => part.trim().replace(/(?<![\w/.])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\w/.])/g, (identifier) => {
      const words = identifier.split("_").map((word) => PROPER_NAMES[word] || word);
      const phrase = words.join(" ");
      return phrase.charAt(0).toUpperCase() + phrase.slice(1);
    }))
    .join(" · ");
}

const ROUTES = {
  local_file: "Local file", local_json_file: "Local file", local_json_glob: "Local file set",
  local_csv_file: "Local CSV file", local_csv_glob: "Local CSV files", local_parquet_panel: "Local research panel",
  local_jsonl_catalog: "Local catalogue", local_gdelt_panel_csv: "Local GDELT panel",
  coingecko_simple_price_api: "CoinGecko live API", usdt_bigquery_catalogue: "BigQuery on-chain catalogue",
  procurement_catalog: "Catalogue record", http_manifest: "File download", scraper_run: "Web capture",
  collection_queue_task: "Scheduled collection", synthesis_execute: "Synthesis", huggingface_collect: "Hugging Face download",
  materialized_query_ready: "Collected, ready to query", derived_internal: "Built in Synthesis", queue: "Collection queue",
};

export function plainRoute(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  return ROUTES[key.toLowerCase()] || plainIdentifiers(key);
}
