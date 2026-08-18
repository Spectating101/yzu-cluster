import { magnitudeGap, unitOutcomes, unitSpread } from "./unitConflict.js";

export function UnitConflictPanel({ conflict, onChoose, onAsk }) {
  if (!conflict?.left || !conflict?.right) return null;
  const gap = magnitudeGap(conflict.left, conflict.right);
  const outcomes = unitOutcomes(conflict);
  const spread = unitSpread(conflict);

  return (
    <section className="s04-card" data-testid="synthesis-unit-conflict">
      <header className="s04-title">
        <div>
          <small>Needs you</small>
          <h2>These two are about to be combined</h2>
        </div>
        {gap ? <em className="warn">{gap.ratio}× apart</em> : null}
      </header>

      <dl className="s04-method">
        <div><dt>{conflict.left.column}</dt><dd>typically {conflict.left.typical}</dd></div>
        <div><dt>{conflict.right.column}</dt><dd>typically {conflict.right.typical}</dd></div>
      </dl>

      {gap?.suspicious ? (
        <p className="s04-fixture">
          One of these is probably a percentage and the other a fraction. Both series
          are internally consistent, so only their documentation settles it.
        </p>
      ) : null}

      <div className="s04-options">
        <small>What the output becomes</small>
        <ul>
          {outcomes.map((outcome) => (
            <li key={outcome.id}>
              <button
                type="button"
                className={outcome.recommended ? "rd-v2-btn primary" : "rd-v2-btn"}
                onClick={() => onChoose?.(outcome)}
              >
                {outcome.label}
              </button>
              <span>{outcome.resultLabel}</span>
            </li>
          ))}
        </ul>
      </div>

      {spread ? (
        <p className="s04-fixture">
          The two answers differ by {spread}×. Neither fails — the wrong one simply
          returns a plausible number.
        </p>
      ) : null}

      <footer className="s04-actions">
        <button type="button" className="rd-v2-btn" onClick={() => onAsk?.("Which of these two columns is published as a percentage?")}>
          Ask which is which
        </button>
      </footer>
    </section>
  );
}

export default UnitConflictPanel;
