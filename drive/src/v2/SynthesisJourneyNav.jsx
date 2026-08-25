import { synthesisJourney, synthesisStageLockReason } from "./synthesisLifecycle.js";
import "./synthesis-production.css";

const VISIBLE_PHASES = [
  {
    id: "objective",
    label: "Objective",
    detail: "Research object",
    stages: ["objective"],
  },
  {
    id: "evidence",
    label: "Evidence",
    detail: "Held inputs",
    stages: ["evidence"],
  },
  {
    id: "method",
    label: "Method",
    detail: "Construction choices",
    stages: ["specification"],
  },
  {
    id: "review",
    label: "Review",
    detail: "Proposal + authority",
    stages: ["proposal", "readiness", "approval"],
  },
  {
    id: "build",
    label: "Build",
    detail: "Execution + registration",
    stages: ["build"],
  },
  {
    id: "result",
    label: "Result",
    detail: "Registered evidence",
    stages: ["result"],
  },
];

function stageIndex(journey, stageId) {
  return journey.stages.findIndex((stage) => stage.id === stageId);
}

function phaseState(journey, phase) {
  const currentIndex = journey.currentIndex;
  const indexes = phase.stages.map((id) => stageIndex(journey, id)).filter((index) => index >= 0);
  const first = Math.min(...indexes);
  const last = Math.max(...indexes);
  if (currentIndex > last) return "done";
  if (currentIndex >= first && currentIndex <= last) return "current";
  return "locked";
}

function phaseInspectionStage(journey, phase) {
  const inspectable = phase.stages
    .map((id) => journey.stages.find((stage) => stage.id === id))
    .filter(Boolean)
    .filter((stage) => stage.inspectable);
  if (!inspectable.length) return "";
  const currentInPhase = inspectable.find((stage) => stage.id === journey.current);
  return currentInPhase?.id || inspectable[inspectable.length - 1].id;
}

function phaseLockReason(thread, journey, phase) {
  const first = phase.stages[0];
  const stage = journey.stages.find((item) => item.id === first);
  if (!stage?.locked) return "";
  return synthesisStageLockReason(thread, first);
}

export function SynthesisJourneyNav({ thread, inspectedStage, onInspect }) {
  const journey = synthesisJourney(thread);
  const inspected = inspectedStage || journey.current;

  return (
    <nav className="sj-journey" aria-label="Synthesis research phases" data-testid="synthesis-journey">
      <ol>
        {VISIBLE_PHASES.map((phase) => {
          const state = phaseState(journey, phase);
          const target = phaseInspectionStage(journey, phase);
          const selected = phase.stages.includes(inspected);
          const current = phase.stages.includes(journey.current);
          const locked = state === "locked";
          const lockReason = phaseLockReason(thread, journey, phase);
          return (
            <li
              key={phase.id}
              className={[state, selected ? "selected" : "", current ? "earned-current" : ""]
                .filter(Boolean)
                .join(" ")}
              data-phase={phase.id}
            >
              <button
                type="button"
                disabled={locked}
                aria-current={current ? "step" : undefined}
                aria-pressed={selected}
                aria-label={locked ? `${phase.label} locked: ${lockReason}` : phase.label}
                title={locked ? lockReason : phase.detail}
                onClick={() => !locked && target && onInspect?.(target)}
              >
                <span className="sj-journey-index" aria-hidden="true">
                  {state === "done" ? "✓" : ""}
                </span>
                <span className="sj-journey-copy">
                  <strong>{phase.label}</strong>
                  <small>{current ? "Current" : state === "done" ? "Recorded" : phase.detail}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
