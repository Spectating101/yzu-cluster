import { magnitudeGap, unitOutcomes, unitSpread } from "./unitConflict.js";
import { UnitScaleVisual } from "./SynthesisVisualReasoning.jsx";

export function UnitConflictPanel({ conflict, onChoose, onAsk }) {
  if (!conflict?.left || !conflict?.right) return null;
  const gap = magnitudeGap(conflict.left, conflict.right);
  const outcomes = unitOutcomes(conflict);
  const spread = unitSpread(conflict);

  return (
    <section className="s04-card s04-blocking" data-testid="synthesis-unit-conflict">
      <header className="s04-title">
        <div>
          <small>{onChoose ? "Needs you" : "Measured warning"}</small>
          <h2>{onChoose ? "These two are about to be combined" : "Two mapped columns use incompatible scales"}</h2>
        </div>
        {gap ? <em className="warn">{gap.ratio}× apart</em> : null}
      </header>

      <UnitScaleVisual conflict={conflict} outcomes={outcomes} />

      {gap?.suspicious ? (
        <p className="s04-note">
          <b>Why this needs you</b>
          One of these is probably a percentage and the other a fraction. Both series
          are internally consistent, so only their documentation settles it.
        </p>
      ) : null}

      <div className="s04-options">
        <small>{onChoose ? "What the output becomes" : "Possible method choices"}</small>
        <ul>
          {outcomes.map((outcome) => (
            <li key={outcome.id}>
              {onChoose ? (
                <button
                  type="button"
                  className={outcome.recommended ? "rd-v2-btn primary" : "rd-v2-btn"}
                  onClick={() => onChoose(outcome)}
                >
                  {outcome.label}
                </button>
              ) : (
                <strong className={outcome.recommended ? "s04-decision-label recommended" : "s04-decision-label"}>
                  {outcome.label}
                </strong>
              )}
              <span>{!onChoose && outcome.result == null ? "awaiting method design" : outcome.resultLabel}</span>
            </li>
          ))}
        </ul>
      </div>

      {spread ? (
        <p className="s04-note">
          <b>What it costs to get wrong</b>
          The two answers differ by {spread}×. Neither fails — the wrong one simply
          returns a plausible number.
        </p>
      ) : null}

      {onAsk ? (
        <footer className="s04-actions">
          <button type="button" className="rd-v2-btn" onClick={() => onAsk("Which of these two columns is published as a percentage?")}>
            Ask which is which
          </button>
        </footer>
      ) : null}
    </section>
  );
}

export default UnitConflictPanel;
