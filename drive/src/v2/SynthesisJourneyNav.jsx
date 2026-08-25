import { synthesisJourney, synthesisStageLockReason } from "./synthesisLifecycle.js";

export function SynthesisJourneyNav({ thread, inspectedStage, onInspect }) {
  const journey = synthesisJourney(thread);
  const inspected = inspectedStage || journey.current;

  return (
    <nav className="sj-journey" aria-label="Synthesis workflow" data-testid="synthesis-journey">
      <ol>
        {journey.stages.map((stage) => {
          const selected = stage.id === inspected;
          const current = stage.id === journey.current;
          const lockReason = synthesisStageLockReason(thread, stage.id);
          return (
            <li
              key={stage.id}
              className={[stage.state, selected ? "selected" : "", current ? "earned-current" : ""]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                disabled={stage.locked}
                aria-current={current ? "step" : undefined}
                aria-pressed={selected}
                aria-label={stage.locked ? `${stage.label} locked: ${lockReason}` : stage.label}
                title={stage.locked ? lockReason : stage.detail}
                onClick={() => !stage.locked && onInspect?.(stage.id)}
              >
                <span className="sj-journey-index" aria-hidden="true">
                  {stage.state === "done" ? "✓" : stage.index + 1}
                </span>
                <span className="sj-journey-copy">
                  <strong>{stage.label}</strong>
                  <small>{current ? "Current work" : stage.state === "done" ? "Recorded" : "Locked"}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
