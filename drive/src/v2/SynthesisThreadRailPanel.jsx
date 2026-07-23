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
  if (!controlled.length) return "No controlled ingredients established";
  return referenced
    ? `${controlled.length} controlled · ${referenced} awaiting proof mapping`
    : `${controlled.length} controlled ingredients`;
}

function limitationAuthority(view) {
  if (!view.idealEvidence.length) return "No direct-measure limitation recorded";
  if (view.idealEvidence.length === 1) return view.idealEvidence[0].label;
  return `${view.idealEvidence.length} direct-measure limitations recorded`;
}

export function SynthesisThreadRailPanel({ thread, onOpenInLibrary }) {
  const view = normalizeProxyDatasetDesign(thread);
  if (!view) return null;
  const outputId = view.outputContract.datasetId;

  return (
    <RailFrame>
      <RailEntityHeader
        title="Proxy design authority"
        description={view.provenance.updatedAt ? `Updated ${view.provenance.updatedAt}` : "Authority attached to the selected proxy design"}
      />
      <RailFieldGrid>
        <RailField label="Construction ID" value={view.provenance.threadId || "Not reported"} mono />
        <RailField label="Target construct" value={view.target.label} />
        <RailField label="Recipe state" value={view.primaryRecipe?.title || "Structured recommendation not generated"} />
        <RailField label="Controlled evidence" value={ingredientAuthority(view)} />
        <RailField label="Measurement limitation" value={limitationAuthority(view)} />
        <RailField label="Evidence authority" value={view.provenance.evidenceSource} />
        <RailField label="Archive proof" value={view.provenance.archiveVerified ? "Reported verified" : "Not established"} />
        <RailField label="Registry proof" value={view.provenance.registryVerified ? "Indexed and traceable" : "Not established"} />
        <RailField label="Output dataset" value={outputId || "Not established"} mono={Boolean(outputId)} />
        <RailField label="Manifest" value={view.provenance.manifestId || "Not reported"} mono={Boolean(view.provenance.manifestId)} />
      </RailFieldGrid>
      {outputId && ["registered", "query_ready"].includes(view.mode) ? (
        <RailStickyFooter>
          <button
            type="button"
            className="rd-v2-btn primary"
            aria-label="Open in Library"
            onClick={() => onOpenInLibrary?.({
              dataset_id: outputId,
              name: outputId,
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
