import { isOpsNoiseDataset } from "./professorVaultTree.js";
import { isLocalHolding } from "./discoverTaxonomy.js";

// Four screens were reporting the same idea with four numbers: the chrome said
// 168, the Library body 112, Discover's idle sentence 149, its counter row 9.
// Three of those are real and distinct quantities; the fourth was the chrome
// counting the raw registry. Naming them here means a fifth cannot appear
// quietly, and a caller has to choose which one it means.

/** Every row the registry declares, held or not. */
export function registryTotal(rows = []) {
  return rows.length;
}

/** What the Library shows a researcher — the estate minus operator-only rows. */
export function libraryVisible(rows = []) {
  return rows.filter((row) => !isOpsNoiseDataset(row)).length;
}

/** What the desk possesses, used to classify a Discover result as already held.
 *  Deliberately includes operator rows: an ops dataset is still held, and
 *  Discover must not offer to acquire something already on the disk. */
export function heldForClassification(rows = []) {
  return rows.filter((row) => isLocalHolding(row)).length;
}

/** Held AND shown in the Library. This is what "Library evidence" means to a
 *  researcher, and the only count a sentence using that phrase may report. */
export function libraryEvidence(rows = []) {
  return rows.filter((row) => !isOpsNoiseDataset(row) && isLocalHolding(row)).length;
}

export function deskCounts(rows = []) {
  return {
    registry: registryTotal(rows),
    libraryVisible: libraryVisible(rows),
    heldForClassification: heldForClassification(rows),
    libraryEvidence: libraryEvidence(rows),
  };
}
