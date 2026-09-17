const TAB_OBJECT_KINDS = Object.freeze({
  home: new Set(["dataset", "home_attention"]),
  library: new Set(["dataset", "library_folder", "library_intake"]),
  browse: new Set(["external_candidate", "discover_history", "discover_investigation"]),
  resources: new Set(["resource_row"]),
  synthesis: new Set(["synthesis_thread"]),
});

export function activeObjectBelongsToTab(tab, object) {
  if (!object?.kind) return false;
  if (tab === "home" && object.kind === "dataset") return object.owner === "home";
  return TAB_OBJECT_KINDS[tab]?.has(object.kind) || false;
}
