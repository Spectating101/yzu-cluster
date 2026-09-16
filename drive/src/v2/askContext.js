import { activeObjectBelongsToTab } from "./contextOwnership.js";
import { DISCOVER_TAB } from "./tabIdentity.js";

function titled(title, fields = {}) {
  return { title, ...fields };
}

export function askDatasetForSurface({
  tab,
  detail,
  activeObject,
  browseTarget,
  discoverIntentRecord,
  selectedHistoryEvent,
  resourceRow,
  profile,
} = {}) {
  const scopedObject = activeObjectBelongsToTab(tab, activeObject) ? activeObject : null;

  if (tab === "resources") {
    return titled(resourceRow ? `Resources · ${resourceRow.label}` : "Resources · Research capacity");
  }
  if (tab === DISCOVER_TAB) {
    if (discoverIntentRecord) {
      return titled(
        discoverIntentRecord.intent?.title || discoverIntentRecord.candidate?.title || "Acquisition review",
        {
          kind: "discover_intent",
          intent_id: discoverIntentRecord.intent?.id,
          research_need:
            discoverIntentRecord.intent?.research_need || discoverIntentRecord.researchNeed,
        },
      );
    }
    if (selectedHistoryEvent) {
      return {
        ...selectedHistoryEvent,
        title: selectedHistoryEvent.target || selectedHistoryEvent.title,
        kind: "discover_history",
      };
    }
    return browseTarget || (scopedObject?.kind === "discover_investigation" ? scopedObject : null) || titled("Discover");
  }
  if (tab === "home") {
    if (scopedObject?.kind === "home_attention") {
      return titled(`Home · ${scopedObject.title}`, {
        kind: "home_attention",
        id: scopedObject.id,
      });
    }
    return scopedObject?.kind === "dataset" && detail?.dataset_id ? detail : titled("Home");
  }
  if (tab === "library") {
    if (scopedObject?.kind === "library_folder" || scopedObject?.kind === "library_intake") {
      return titled(`Library · ${scopedObject.title}`);
    }
    return scopedObject?.kind === "dataset" && detail?.dataset_id ? detail : titled("Library");
  }
  if (tab === "synthesis") {
    return scopedObject?.kind === "synthesis_thread"
      ? titled(scopedObject.title, {
          kind: "synthesis_thread",
          thread_id: scopedObject.id,
          session_id: scopedObject.thread?.session_id || "",
        })
      : titled("Synthesis studio", { kind: "synthesis_thread" });
  }
  if (tab === "profile") {
    return titled(
      profile?.name_en && !profile.unknown ? `Profile · ${profile.name_en}` : "Profile",
    );
  }
  if (tab === "settings") return titled("Desk setup");
  return titled("Research Drive");
}
