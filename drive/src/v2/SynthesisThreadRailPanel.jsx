import {
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";
import { normalizeResearchConstruction } from "@/v2/ResearchConstructionViewModel";
import { RESEARCH_ACTIONS } from "@/v2/researchValue";

function evidenceCount(view) {
  const summary = view.evidenceSummary;
  if (!summary.available && !summary.missing) return "No evidence established";
  if (summary.referenced) {
    return `${summary.available} controlled · ${summary.referenced} awaiting proof mapping · ${summary.missing} missing`;
  }
  return `${summary.mapped} controlled · ${summary.missing} missing`;
}

export function SynthesisThreadRailPanel({ thread, onOpenInLibrary }) {
  const view = normalizeResearchConstruction(thread);
  if (!view) return null;
  const outputId = view.outputContract.datasetId;

  return (
    <RailFrame>
      <RailEntityHeader
        title="Construction authority"
        description={view.provenance.updatedAt ? `Updated ${view.provenance.updatedAt}` : "Authority attached to the selected construction"}
      />
      <RailFieldGrid>
        <RailField label="Construction ID" value={view.provenance.threadId || "Not reported"} mono />
        <RailField label="Evidence state" value={evidenceCount(view)} />
        <RailField label="Evidence authority" value={view.provenance.evidenceSource} />
        <RailField label="Archive proof" value={view.provenance.archiveVerified ? "Reported verified" : "Not established"} />
        <RailField label="Registry proof" value={view.provenance.registryVerified ? "Indexed and traceable" : "Not established"} />
        <RailField label="Output asset" value={outputId || "Not established"} mono={Boolean(outputId)} />
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
