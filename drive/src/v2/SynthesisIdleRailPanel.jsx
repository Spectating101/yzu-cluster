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
    <details className="s04-workflow-guide">
      <summary>
        <span>
          <small>How one construction moves</small>
          <strong>Objective → Evidence → Method → … → Result</strong>
        </span>
        <em>8 stages</em>
      </summary>
      <div className="s04-workflow-guide-body" aria-label="How one Synthesis construction moves">
        <p>Recommendation and execution are separate authority boundaries.</p>
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
      </div>
    </details>
  );
}

export function SynthesisIdleRailPanel({ onAskAbout }) {
  return (
    <RailFrame>
      <RailEntityHeader
        title="No construction selected"
        description="Start a construction from a research question, or open a registered method."
      />
      <div className="rd-v2-rail-scroll">
        <RailFieldGrid>
          <RailField label="Start" value="Describe the construct you need" />
          <RailField label="Ask" value="Clarifies meaning and required evidence" />
          <RailField label="Ground" value="Checks Library inputs and defensible proxies" />
          <RailField label="Review" value="You approve the method before execution" />
          <RailField label="Output" value="Archive, registration, and readiness remain separate" />
        </RailFieldGrid>
        <WorkflowGuide />
      </div>
      <RailStickyFooter>
        <button type="button" className="rd-v2-btn sm" onClick={() => onAskAbout?.()}>
          Ask about this workspace →
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}
