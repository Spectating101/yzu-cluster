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
 * ResearchSituationRail already owns the current situation (new construction,
 * missing objective, and next action). This panel therefore must not repeat
 * those facts. It explains the durable authority boundaries that will matter
 * once the researcher starts writing state.
 */
export function SynthesisIdleRailPanel({ onAskAbout }) {
  return (
    <RailFrame>
      <RailEntityHeader
        title="Authority map"
        description="What Synthesis preserves as a construction moves from evidence to a reusable result."
      />
      <div className="rd-v2-rail-scroll">
        <RailFieldGrid>
          <RailField label="Evidence" value="Held Library inputs remain identifiable" />
          <RailField label="Method" value="Proposal is reviewable before acceptance" />
          <RailField label="Execution" value="Researcher approval is a separate gate" />
          <RailField label="Result" value="Registered output returns to Library" />
        </RailFieldGrid>
      </div>
      <RailStickyFooter>
        <button type="button" className="rd-v2-btn sm" onClick={() => onAskAbout?.()}>
          Ask about Synthesis →
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}
