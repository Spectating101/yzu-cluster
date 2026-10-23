// docs/archive/ui-2026/DISCOVER_ADAPTIVE_FREEZE_2026-07-28 §3 binds this row to exactly three
// counters: sources, in your Library, web results.
//
// The bug it was hiding was real — resultGroups sorts into four groups and the
// row named three, so a DataCite row classified external-discoverable rendered
// in the centre and was counted nowhere. My first fix added a fourth counter,
// which broke the freeze. The conformant fix is better: "Available" means
// everything the centre shows, so the fourth group folds into it instead of
// earning a label the spec does not have.
export const TERRITORIES = [
  { id: "available", label: "Sources", inCentre: true, groups: ["available", "external"] },
  { id: "held", label: "In your Library", inCentre: false, groups: ["held"] },
  { id: "context", label: "Web results", inCentre: false, groups: ["context"] },
];

export function territoryText(id, count) {
  const n = Number(count) || 0;
  if (id === "held") return `${n} in your Library`;
  if (id === "context") return `${n} web result${n === 1 ? "" : "s"}`;
  return `${n} source${n === 1 ? "" : "s"}`;
}

export function discoverTerritories(groups) {
  const g = groups || {};
  return TERRITORIES.map((t) => ({
    id: t.id,
    label: t.label,
    count: t.groups.reduce((n, key) => n + (g[key] || []).length, 0),
    inCentre: t.inCentre,
  }));
}

export function centreCount(groups) {
  return discoverTerritories(groups)
    .filter((t) => t.inCentre)
    .reduce((n, t) => n + t.count, 0);
}

/** Groups no territory claims. A new one must be folded in deliberately, not
 *  silently rendered in the centre and counted nowhere. */
export function unaccounted(groups) {
  const named = new Set(TERRITORIES.flatMap((t) => t.groups));
  return Object.keys(groups || {}).filter((k) => !named.has(k));
}
