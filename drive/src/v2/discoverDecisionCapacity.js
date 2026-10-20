import { buildCapacityAccessPairs } from "./resourcesCapacity.js";

function text(value) {
  return String(value ?? "").trim();
}

function routeText(routes = []) {
  return routes
    .map((route) => [route?.source_id, route?.label, route?.provider, route?.access_mode, route?.reason].filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();
}

export function buildDiscoverDecisionCapacity(rollup, health, { routes = [] } = {}) {
  if (!rollup || typeof rollup !== "object") return [];
  const pairs = buildCapacityAccessPairs(rollup, health);
  const meters = new Map(
    pairs.flatMap((pair) => pair.meters || []).map((meter) => [meter.id, meter]),
  );
  const routeBlob = routeText(routes);
  const ids = ["fleet", "vault"];
  const bigquery = meters.get("bigquery");
  if (bigquery && (/bigquery|warehouse|remote table/.test(routeBlob) || !/not configured/i.test(text(bigquery.metric)))) {
    ids.splice(1, 0, "bigquery");
  }
  const cache = meters.get("cache");
  if (cache?.warn) ids.push("cache");

  return ids
    .map((id) => meters.get(id))
    .filter(Boolean)
    .map((meter) => ({
      id: meter.id,
      label: meter.name,
      metric: text(meter.metric) || "Not reported",
      detail: text(meter.available),
      attention: Boolean(meter.warn),
    }));
}
