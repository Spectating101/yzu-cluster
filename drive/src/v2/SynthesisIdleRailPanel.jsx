import {
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";

const JOURNEY = [
  ["Objective", "State what should exist or be measured"],
  ["Evidence", "Review data in your Library and find what is missing"],
  ["Method", "Resolve scope, units, joins, and build choices"],
  ["Proposal", "Review this version before accepting it"],
  ["Preview", "Run the accepted recipe on sample data"],
  ["Approval", "Explicitly authorize the previewed execution"],
  ["Build", "Observe worker execution and saved proof"],
  ["Result", "Save to Library, verify, and reuse the research dataset"],
];

function WorkflowGuide() {
  return (
    <details className="s04-workflow-guide">
      <summary>
        <span>
          <small>How one build moves</small>
          <strong>Objective → Evidence → Method → … → Result</strong>
        </span>
        <em>8 stages</em>
      </summary>
      <div className="s04-workflow-guide-body" aria-label="How one Synthesis build moves">
        <p>A suggested build and permission to run it require separate decisions.</p>
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
        <p>This map shows the stages of a build. Later stages become available only when the saved work meets their requirements.</p>
      </div>
    </details>
  );
}

export function SynthesisIdleRailPanel({ onAskAbout }) {
  return (
    <RailFrame>
      <RailEntityHeader
        title="No build selected"
        description="Start a build from a research question, or open a method saved to Library."
      />
      <div className="rd-v2-rail-scroll">
        <RailFieldGrid>
          <RailField label="Start" value="Describe the construct you need" />
          <RailField label="Ask" value="Clarifies meaning and required evidence" />
          <RailField label="Ground" value="Checks Library inputs and defensible proxies" />
          <RailField label="Review" value="You approve the method before execution" />
          <RailField label="Output" value="Archiving, saving to Library, and readiness remain separate" />
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
