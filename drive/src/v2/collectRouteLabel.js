/** Researcher-facing names for backend collect_via route kinds. */

const ROUTE_LABELS = {
  http_manifest: "a file manifest",
  file_manifest: "a file manifest",
  web_scrape: "browser extraction",
  browser: "browser extraction",
  local_open: "a local file",
  local: "a local file",
  bigquery: "BigQuery",
  datacite: "the DataCite API",
  huggingface: "the Hugging Face API",
  lseg: "LSEG data API",
  refinitiv: "LSEG data API",
  queue: "queue",
  api: "an API query",
  api_query: "an API query",
};

const UNNAMED_ROUTE = "a declared route";

export function collectRouteLabel(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!key || key === "none") return "";
  return ROUTE_LABELS[key] || UNNAMED_ROUTE;
}

export function isNamedRoute(value) {
  const label = collectRouteLabel(value);
  return Boolean(label) && label !== UNNAMED_ROUTE;
}

export { UNNAMED_ROUTE };
