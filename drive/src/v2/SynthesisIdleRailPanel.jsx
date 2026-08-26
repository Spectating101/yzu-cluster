import {
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";
import "./synthesis-desktop-polish.css";

const JOURNEY = [
  ["Objective", "State what should exist or be measured"],
  ["Evidence", "Review held evidence and route genuine gaps"],
  ["Method", "Resolve scope, units, joins, and construction choices"],
  ["Proposal", "Review one exact revision before accepting it"],
  ["Preview", "Run the accepted recipe on bounded real bytes"],
  ["Approval", "Explicitly authorize the previewed execution"],
  ["Build", "Observe worker execution and durable proof"],
  ["Result", "Register, verify, and reuse the research asset"],
];

function WorkflowGuide() {
  return (
    <section className="s04-workflow-guide" aria-label="How one Synthesis construction moves">
      <header>
        <span>How one construction moves</span>
        <strong>Recommendation and execution are deliberately separate authority boundaries.</strong>
      </header>
      <ol>
        {JOURNEY.map(([label, description]) => (
          <li key={label}>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </li>
        ))}
      </ol>
      <p>This is a map, not a progress score. Later stages remain unavailable until the durable thread earns them.</p>
    </section>
  );
}

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
        <WorkflowGuide />
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