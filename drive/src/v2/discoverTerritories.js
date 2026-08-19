export const TERRITORIES = [
  { id: "available", label: "Available", inCentre: true },
  { id: "external", label: "Not assessed", inCentre: true },
  { id: "held", label: "Library evidence", inCentre: false },
  { id: "context", label: "Web context", inCentre: false },
];

export function discoverTerritories(groups) {
  const g = groups || {};
  return TERRITORIES.map((t) => ({
    id: t.id,
    label: t.label,
    count: (g[t.id] || []).length,
    inCentre: t.inCentre,
  }));
}

export function centreCount(groups) {
  return discoverTerritories(groups)
    .filter((t) => t.inCentre)
    .reduce((n, t) => n + t.count, 0);
}

export function unaccounted(groups) {
  const named = new Set(TERRITORIES.map((t) => t.id));
  return Object.keys(groups || {}).filter((k) => !named.has(k));
}
