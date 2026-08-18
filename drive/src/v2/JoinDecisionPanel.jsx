import { collapseChoices, coverageVerdict, joinOutcomes, needsCollapse, rankCandidates } from "./joinCandidates.js";

function CoverageBar({ value }) {
  const share = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <span className="s04-coverage" role="img" aria-label={`${share}% of the left side matched`}>
      <b style={{ width: `${share}%` }} />
    </span>
  );
}

export function JoinDecisionPanel({ leftLabel, rightLabel, coverage, onChooseKey, onChooseOutcome, onChooseCollapse }) {
  const candidates = rankCandidates(coverage);
  if (!candidates.length) return null;
  const best = candidates[0];
  const verdict = coverageVerdict(best);

  return (
    <section className="s04-card" data-testid="synthesis-join-decision">
      <header className="s04-title">
        <div>
          <small>Adding evidence</small>
          <h2>{rightLabel || "A second dataset"}</h2>
        </div>
        <em className={verdict === "strong" ? "success" : "warn"}>
          {best.coverage == null ? "no usable key" : `${best.coverage}% of ${leftLabel || "the left side"}`}
        </em>
      </header>

      <div className="s04-resolved-list">
        <small>Which key links them?</small>
        <ul>
          {candidates.map((candidate) => (
            <li key={`${candidate.leftKey}-${candidate.rightKey}`}>
              <button type="button" className="rd-v2-btn" onClick={() => onChooseKey?.(candidate)}>
                {candidate.leftKey === candidate.rightKey
                  ? candidate.leftKey
                  : `${candidate.leftKey} → ${candidate.rightKey}`}
              </button>
              <CoverageBar value={candidate.coverage} />
              <span>
                {candidate.usable
                  ? `${Number(candidate.matched).toLocaleString()} of ${Number(candidate.total).toLocaleString()}`
                  : candidate.reason}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="s04-resolved-list">
        <small>What each choice does to the study</small>
        <ul>
          {joinOutcomes(best).map((outcome) => (
            <li key={outcome.id}>
              <button
                type="button"
                className={outcome.recommended ? "rd-v2-btn primary" : "rd-v2-btn"}
                onClick={() => onChooseOutcome?.(outcome)}
              >
                {outcome.label}
              </button>
              <span>{outcome.consequence}</span>
            </li>
          ))}
        </ul>
      </div>

      {needsCollapse(best) ? (
        <div className="s04-resolved-list" data-testid="synthesis-collapse-choice">
          <small>The right side repeats this key — which row should win?</small>
          <ul>
            {collapseChoices(best).map((choice) => (
              <li key={choice.id}>
                <button
                  type="button"
                  className={choice.recommended ? "rd-v2-btn primary" : "rd-v2-btn"}
                  onClick={() => onChooseCollapse?.(choice)}
                >
                  {choice.label}
                </button>
                <span>{choice.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="s04-fixture">
          No key duplicates, so no collapse strategy is needed. Coverage is the question here.
        </p>
      )}
    </section>
  );
}

export default JoinDecisionPanel;
