import {
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";

/**
 * Idle Synthesis rail.
 *
 * The centre owns the live workspace inventory and counts. This panel explains
 * what the directory contains without pretending that one construction is
 * already selected or duplicating changing counts from the home canvas.
 */
export function SynthesisIdleRailPanel({ onAskAbout }) {
  return (
    <RailFrame>
      <RailEntityHeader
        title="Workspace map"
        description="How independent constructions, reusable methods, and finished research assets relate inside Synthesis."
      />
      <div className="rd-v2-rail-scroll">
        <RailFieldGrid>
          <RailField label="Work" value="Each construction keeps its own evidence, decisions, and execution state" />
          <RailField label="Methods" value="Registered methods start a new construction; old assumptions are not silently inherited" />
          <RailField label="Results" value="Registered outputs remain linked to their construction and return to Library" />
          <RailField label="Authority" value="Method acceptance and execution approval stay explicit per construction" />
        </RailFieldGrid>
      </div>
      <RailStickyFooter>
        <button type="button" className="rd-v2-btn sm" onClick={() => onAskAbout?.()}>
          Ask about this workspace →
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}