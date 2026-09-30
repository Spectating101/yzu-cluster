import { DISCOVER_TAB, canonicalTab } from "./tabIdentity.js";

const TAB_OBJECT_KINDS = Object.freeze({
  home: new Set(["dataset", "home_attention"]),
  library: new Set(["dataset", "library_folder", "library_intake"]),
  [DISCOVER_TAB]: new Set(["external_candidate", "discover_history", "discover_investigation"]),
  resources: new Set(["resource_row"]),
  synthesis: new Set(["synthesis_thread"]),
});

export function activeObjectBelongsToTab(tab, object) {
  if (!object?.kind) return false;
  const id = canonicalTab(tab);
  if (id === "home" && object.kind === "dataset") return object.owner === "home";
  return TAB_OBJECT_KINDS[id]?.has(object.kind) || false;
}
