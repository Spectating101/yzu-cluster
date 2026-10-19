import { isOpsNoiseDataset } from "./professorVaultTree.js";
import { isLocalHolding } from "./discoverTaxonomy.js";
import { statusPillKind } from "./datasetMeta.js";

// Discover's resting state claimed "103 assets are checked automatically" and
// never showed one of them. The claim was the only thing on screen; the evidence
// for it was nowhere.
//
// The first cut of this grouped by shelf_hint and counted query-ready with its
// own predicate, which produced a third shelf taxonomy and a fifth count: the
// panel said 61 query-ready across "Crypto Onchain / Project Downloads" while
// Library said 64 across "Markets / Derived". Two names for one idea, again.
// Grouping is now the Library's own lanes, and readiness is the same predicate
// its rows use.

const label = (id) =>
  String(id || "other").replace(/[-_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const isReady = (row) => statusPillKind(row).kind === "query-ready";

/** Which Library shelf a row belongs to.
 *  The lane's own membership list wins, because that is what the Library tree
 *  assigns folders from; a row's partition_id is only the fallback. Reading the
 *  row first put one dataset in Derived that the Library shows under Markets. */
function shelfIdFor(row, lanes, membership) {
  const id = String(row?.dataset_id || row?.id || "");
  if (id && membership.has(id)) return membership.get(id);
  const pid = String(row?.collection?.partition_id || row?.partition_id || "").trim();
  if (!pid) return "other";
  return String(lanes.get(pid)?.shelf_id || pid.split(".")[0] || "other");
}

/** Shelves the search covers, largest first, with how much of each is queryable.
 *  `partitions` are the lanes /library/partitions serves — the same ones the
 *  Library tree is built from, so the two pages cannot name shelves differently. */
export function coverageShelves(catalog = [], partitions = [], shelves = []) {
  const lanes = new Map(
    (partitions || [])
      .map((lane) => [String(lane?.partition_id || lane?.detail?.partition_id || ""), lane])
      .filter(([id]) => id),
  );
  const shelfLabels = new Map(
    (shelves || []).map((s) => [String(s?.id || ""), String(s?.label || s?.id || "")]),
  );
  const membership = new Map();
  for (const lane of partitions || []) {
    const shelf = String(lane?.shelf_id || String(lane?.partition_id || "").split(".")[0] || "other");
    for (const id of lane?.registry_dataset_ids || lane?.detail?.registry_dataset_ids || []) {
      membership.set(String(id), shelf);
    }
  }
  const visible = catalog.filter((row) => row && !isOpsNoiseDataset(row));
  const byShelf = new Map();
  for (const row of visible) {
    const id = shelfIdFor(row, lanes, membership);
    const shelf = byShelf.get(id)
      || { id, label: shelfLabels.get(id) || label(id), total: 0, held: 0, queryReady: 0 };
    shelf.total += 1;
    if (isLocalHolding(row)) shelf.held += 1;
    if (isReady(row)) shelf.queryReady += 1;
    byShelf.set(id, shelf);
  }
  return [...byShelf.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/** Totals the shelf rows must add up to — nothing on screen may disagree. */
export function coverageSummary(catalog = [], partitions = [], shelves_ = []) {
  const shelves = coverageShelves(catalog, partitions, shelves_);
  return {
    shelves,
    total: shelves.reduce((n, s) => n + s.total, 0),
    held: shelves.reduce((n, s) => n + s.held, 0),
    queryReady: shelves.reduce((n, s) => n + s.queryReady, 0),
    declaredNotHeld: shelves.reduce((n, s) => n + (s.total - s.held), 0),
  };
}

/** Shelves worth their own row; the rest collapse into one line. */
export function coverageSplit(catalog = [], partitions = [], shelves_ = [], keep = 5) {
  const shelves = coverageShelves(catalog, partitions, shelves_);
  return { listed: shelves.slice(0, keep), folded: shelves.slice(keep) };
}

/** Bar width as a percentage of the largest shelf, so lengths are comparable. */
export function shelfBar(shelf, shelves) {
  const max = Math.max(1, ...shelves.map((s) => s.total));
  return Math.round(100 * (shelf.total / max));
}
