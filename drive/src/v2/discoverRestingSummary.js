/** Resting Discover rail summary — derived from search rows, never lab holdings length. */

import { classifyDiscoverResult, isLocalHolding } from "./discoverTaxonomy.js";
import { deriveUnknowns } from "./discoverProbeEvidence.js";
import { collectRouteLabel } from "./collectRouteLabel.js";

function collectViaLabel(row) {
  return collectRouteLabel(row?.collect_via);
}

function rowIsHeld(row, labIds) {
  const taxonomy = row?.discover_taxonomy || classifyDiscoverResult(row, labIds);
  return taxonomy.key.startsWith("local-") || isLocalHolding(row, labIds);
}

function rowUnknowns(row, labIds) {
  const taxonomy = row?.discover_taxonomy || classifyDiscoverResult(row, labIds);
  const hasProbe = Boolean(row?.probe_snapshot);
  return deriveUnknowns(row, taxonomy, { verified: [] }, hasProbe);
}

export function buildDiscoverRestingSummary(rows = [], labIds = new Set(), query = "") {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const found = list.length;
  const heldCount = list.filter((row) => rowIsHeld(row, labIds)).length;
  const q = String(query || "").trim();

  const routeCounts = new Map();
  for (const row of list) {
    const label = collectViaLabel(row);
    if (!label) continue;
    routeCounts.set(label, (routeCounts.get(label) || 0) + 1);
  }
  const routes = [...routeCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const seen = new Set();
  const unknowns = [];
  for (const row of list) {
    for (const item of rowUnknowns(row, labIds)) {
      if (seen.has(item)) continue;
      seen.add(item);
      unknowns.push(item);
    }
  }

  return {
    hasResults: found > 0,
    found,
    foundLine: found
      ? `${found} offering${found === 1 ? "" : "s"}`
      : "",
    heldCount,
    heldLine: found ? `${heldCount} of ${found} already held` : "",
    heldBody: found
      ? heldCount
        ? ""
        : "No offering here matched something the lab already holds."
      : "",
    routes,
    unknowns,
    query: q,
  };
}
