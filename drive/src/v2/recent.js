const RECENT_KEY = "rd_v2_recent_datasets";

export function loadRecentIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(deskStorageKey(RECENT_KEY)) || "[]");
    return Array.isArray(raw) ? raw.map((e) => (typeof e === "string" ? e : e.id)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function touchRecent(datasetId) {
  if (!datasetId) return;
  const cur = loadRecentIds().filter((id) => id !== datasetId);
  cur.unshift(datasetId);
  localStorage.setItem(deskStorageKey(RECENT_KEY), JSON.stringify(cur.slice(0, 40)));
}

export function recentDatasets(allDatasets, limit = 6) {
  const byId = new Map(allDatasets.map((d) => [d.dataset_id, d]));
  return loadRecentIds()
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, limit);
}
import { deskStorageKey } from "./deskSession.js";
