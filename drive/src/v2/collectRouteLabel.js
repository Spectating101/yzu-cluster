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

export function collectRouteDisplayLabel(value) {
  const label = collectRouteLabel(value);
  return label === UNNAMED_ROUTE ? "a documented route" : label;
}

// Titles and source fields may contain backend route kinds or legacy defaults.
// Keep custom source names intact; map only the known system vocabulary.
export function collectionRouteTitle(value, sourceTitle = "") {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "collection_route") return "Collection method";
  if (key === "recorded_event") return "Last step";
  if (key === "discover_intent") return "Discover request";
  if (key === "collection_run") return "Collection";
  if (key === "registered_asset") return "Library dataset";
  if (Object.hasOwn(ROUTE_LABELS, key)) return collectRouteDisplayLabel(key);
  if (/^collect through [a-z0-9_-]+$/i.test(raw)) {
    return sourceTitle ? `Collect from ${sourceTitle}` : "Collection method";
  }
  return raw;
}
