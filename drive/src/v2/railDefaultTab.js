import { DISCOVER_TAB, canonicalTab } from "./tabIdentity.js";

export function railHasSelection({
  tab,
  dataset,
  activeObject,
  browseTarget,
  historyEvent,
  discoverIntentRecord,
  discoverAssessment,
  discoverMode,
  discoverRestingSummary,
  resourceRow,
} = {}) {
  const page = canonicalTab(tab);
  const kind = activeObject?.kind;
  if (page === DISCOVER_TAB) {
    return Boolean(
      discoverIntentRecord ||
        historyEvent ||
        discoverAssessment?.active ||
        browseTarget ||
        discoverMode === "history" ||
        discoverRestingSummary?.hasResults,
    );
  }
  if (page === "library") {
    return Boolean(dataset?.dataset_id || (kind === "library_folder" && activeObject.folderId) || kind === "library_intake");
  }
  if (page === "synthesis") return kind === "synthesis_thread";
  if (page === "resources") return Boolean(resourceRow);
  if (page === "home") {
    return kind === "home_attention" || Boolean(dataset?.dataset_id && kind === "dataset" && activeObject?.owner === "home");
  }
  return false;
}

export function shownRailTab({ railTab, hasSelection, canAsk, detailPinned = false, compact = false }) {
  if (railTab === "ask" || hasSelection || !canAsk || compact) return railTab;
  return detailPinned ? "detail" : "ask";
}
