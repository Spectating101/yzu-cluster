import {
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";
import { normalizeProxyDatasetDesign } from "@/v2/ProxyDatasetDesignViewModel";
import { RESEARCH_ACTIONS } from "@/v2/researchValue";

function ingredientAuthority(view) {
  const controlled = view.ingredients.filter((item) => !item.missing);
  const referenced = controlled.filter((item) => item.proofPending).length;
  if (!controlled.length) return "None mapped";
  return referenced ? `${controlled.length} controlled · ${referenced} unverified` : `${controlled.length} controlled`;
}

function limitationAuthority(view) {
  if (!view.idealEvidence.length) return "Not recorded";
  if (view.idealEvidence.length === 1) return view.idealEvidence[0].label;
  return `${view.idealEvidence.length} limitations`;
}

export function SynthesisThreadRailPanel({ thread, onOpenInLibrary }) {
  const view = normalizeProxyDatasetDesign(thread);
  if (!view) return null;
  const outputId = view.outputContract.datasetId;
  const registered = ["registered", "query_ready"].includes(view.mode);
  const accepted = Boolean(view.capability?.acceptedConstruction);

  return (
    <RailFrame>
      <RailEntityHeader
        title="Proxy authority"
        description={registered ? "Registered construction" : accepted ? "Accepted design" : "Design under review"}
      />
      <RailFieldGrid>
        <RailField label="Target" value={view.target.label} />
        <RailField label="Recipe" value={view.primaryRecipe?.title || "Not generated"} />
        <RailField label="Inputs" value={ingredientAuthority(view)} />
        <RailField label="Direct measure" value={limitationAuthority(view)} />
        <RailField label="Output" value={view.outputContract.label || "Not established"} />
        {registered ? <RailField label="Readiness" value={view.outputContract.statusLabel} /> : null}
        {view.provenance.archiveVerified ? <RailField label="Archive" value="Verified" /> : null}
        {view.provenance.registryVerified ? <RailField label="Registry" value="Verified" /> : null}
        {view.provenance.manifestId ? <RailField label="Manifest" value={view.provenance.manifestId} mono /> : null}
      </RailFieldGrid>
      {outputId && registered ? (
        <RailStickyFooter>
          <button
            type="button"
            className="rd-v2-btn primary"
            aria-label="Open in Library"
            onClick={() => onOpenInLibrary?.({
              dataset_id: outputId,
              name: view.outputContract.label || outputId,
              analysis_readiness: view.mode === "query_ready" ? "instant" : "registered",
            })}
          >
            {RESEARCH_ACTIONS.inspectEvidence}
          </button>
        </RailStickyFooter>
      ) : null}
    </RailFrame>
  );
}
