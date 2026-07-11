/**
 * Discover browse grouping helpers (composition pass).
 * Uses D1 taxonomy.group only — no equivalence / sufficiency.
 */

/**
 * @param {object[]} rows decorated Discover rows with discover_taxonomy
 * @returns {{ id: string, title: string, rows: object[] }[]}
 */
export function groupDiscoverBrowseRows(rows) {
  const lab = [];
  const external = [];
  const access = [];
  for (const row of rows || []) {
    const group = Number(row?.discover_taxonomy?.group ?? 3);
    if (group <= 2) lab.push(row);
    else if (group === 4) access.push(row);
    else external.push(row);
  }
  return [
    { id: "lab", title: "In your lab", rows: lab },
    { id: "external", title: "External candidates", rows: external },
    { id: "access", title: "Needs access", rows: access },
  ].filter((g) => g.rows.length > 0);
}
