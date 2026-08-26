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

export function buildDiscoverRestingSummary(rows = [], labIds = new Set(), query = "", territoryCounts = {}) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const found = list.length;
  const heldCount = list.filter((row) => rowIsHeld(row, labIds)).length;
  const q = String(query || "").trim();
  const libraryEvidenceCount = Number.isFinite(Number(territoryCounts.libraryEvidenceCount))
    ? Math.max(0, Number(territoryCounts.libraryEvidenceCount))
    : heldCount;
  const contextCount = Number.isFinite(Number(territoryCounts.contextCount))
    ? Math.max(0, Number(territoryCounts.contextCount))
    : 0;

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
    // This is the overlap within the visible result set, not the total held
    // Library count shown in Discover chrome. Name that scope so the two
    // truthful values cannot read as a contradiction in the right rail.
    heldLine: found ? `${heldCount} of these ${found} already held` : "",
    heldBody: found
      ? heldCount
        ? ""
        : "No offering here matched something the lab already holds."
      : "",
    libraryEvidenceCount,
    contextCount,
    landscapeLine: [
      `${found} external offering${found === 1 ? "" : "s"}`,
      `${libraryEvidenceCount} Library result${libraryEvidenceCount === 1 ? "" : "s"}`,
      contextCount ? `${contextCount} reference${contextCount === 1 ? "" : "s"}` : "",
    ].filter(Boolean).join(" · "),
    routes,
    unknowns,
    query: q,
  };
}
