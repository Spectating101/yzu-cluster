import { collapseChoices, coverageVerdict, joinOutcomes, needsCollapse, rankCandidates } from "./joinCandidates.js";
import { JoinOverlapVisual } from "./SynthesisVisualReasoning.jsx";
import { MultiOverlapVisual } from "./MultiOverlapVisual.jsx";

function CoverageBar({ value }) {
  const share = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <span className="s04-coverage" role="img" aria-label={`${share}% of the left side matched`}>
      <b style={{ width: `${share}%` }} />
    </span>
  );
}

function DecisionLabel({ children, primary = false, onClick }) {
  if (onClick) {
    return (
      <button type="button" className={primary ? "rd-v2-btn primary" : "rd-v2-btn"} onClick={onClick}>
        {children}
      </button>
    );
  }
  return <strong className={primary ? "s04-decision-label recommended" : "s04-decision-label"}>{children}</strong>;
}

function canonicalDatasetId(value) {
  // softIdentifier() inserts zero-width break opportunities for presentation.
  // Strip only those display characters before comparing durable identities.
  return String(value || "").replace(/\u200b/g, "").trim();
}

function sourceLabelFor(overlap, datasetId, fallback = "") {
  const wanted = canonicalDatasetId(datasetId);
  const source = (overlap?.sources || []).find(
    (row) => canonicalDatasetId(row?.dataset_id) === wanted,
  );
  return String(source?.label || fallback || datasetId || "").trim();
}

export function JoinDecisionPanel({
  leftLabel,
  rightLabel,
  rightTotal,
  coverage,
  multiOverlap,
  onChooseKey,
  onChooseOutcome,
  onChooseCollapse,
  onAsk,
}) {
  const candidates = rankCandidates(coverage);
  if (!candidates.length) return null;
  const best = candidates[0];
  const verdict = coverageVerdict(best);
  // SynthesisPage intentionally copies only measured state fields it already
  // understands. The API client therefore carries higher-order overlap as
  // non-enumerable metadata on the join-candidate array until the page contract
  // itself is widened. Keep the explicit prop as the preferred path.
  const measuredMultiOverlap = multiOverlap || coverage?.multiOverlap || null;
  const leftFallback = best.leftLabel || leftLabel;
  const rightFallback = best.rightLabel || rightLabel;
  const hasMeasuredMultiOverlap = Boolean(
    measuredMultiOverlap?.applicable
      && Number(measuredMultiOverlap?.source_count || measuredMultiOverlap?.sources?.length || 0) >= 3,
  );
  const leftDisplayLabel = sourceLabelFor(measuredMultiOverlap, leftLabel, leftFallback);
  const rightDisplayLabel = sourceLabelFor(measuredMultiOverlap, rightLabel, rightFallback) || "A second dataset";
  const coverageSubject = leftDisplayLabel && leftDisplayLabel.length <= 42
    ? leftDisplayLabel
    : "current input";

  return (
    <section className="s04-card s04-blocking" data-testid="synthesis-join-decision">
      <header className="s04-title">
        <div>
          <small>Join decision</small>
          <h2>{rightDisplayLabel}</h2>
        </div>
        <em className={verdict === "strong" ? "success" : "warn"}>
          {best.coverage == null ? "no usable key" : `${best.coverage}% of ${coverageSubject}`}
        </em>
      </header>

      {hasMeasuredMultiOverlap ? (
        <MultiOverlapVisual overlap={measuredMultiOverlap} />
      ) : best.usable && best.total ? (
        <JoinOverlapVisual
          leftLabel={leftDisplayLabel || leftLabel}
          rightLabel={rightDisplayLabel}
          leftTotal={best.total}
          // Set overlap is defined over distinct keys. A raw row count on a
          // duplicated right side would inflate the Venn/union population.
          rightTotal={best.rightTotal || rightTotal || best.total}
          shared={best.matched}
        />
      ) : null}

      <div className="s04-options">
        <small>Which key links them?</small>
        <ul>
          {candidates.map((candidate) => (
            <li key={`${candidate.leftKey}-${candidate.rightKey}`}>
              <DecisionLabel onClick={onChooseKey ? () => onChooseKey(candidate) : null}>
                {candidate.leftKey === candidate.rightKey
                  ? candidate.leftKey
                  : `${candidate.leftKey} → ${candidate.rightKey}`}
              </DecisionLabel>
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

      <div className="s04-options">
        <small>What each choice does to the study</small>
        <ul>
          {joinOutcomes(best).map((outcome) => (
            <li key={outcome.id}>
              <DecisionLabel
                primary={outcome.recommended}
                onClick={onChooseOutcome ? () => onChooseOutcome(outcome) : null}
              >
                {outcome.label}
              </DecisionLabel>
              <span>{outcome.consequence}</span>
            </li>
          ))}
        </ul>
      </div>

      {needsCollapse(best) ? (
        <div className="s04-options" data-testid="synthesis-collapse-choice">
          <small>The right side repeats this key — which row should win?</small>
          <ul>
            {collapseChoices(best).map((choice) => (
              <li key={choice.id}>
                <DecisionLabel
                  primary={choice.recommended}
                  onClick={onChooseCollapse ? () => onChooseCollapse(choice) : null}
                >
                  {choice.label}
                </DecisionLabel>
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

      {onAsk ? (
        <footer className="s04-actions">
          <p className="s04-note">
            <b>Research boundary</b>
            A technically valid key can still redefine the study population. Treat coverage as a research decision, not plumbing.
          </p>
          <button
            type="button"
            className="rd-v2-btn"
            onClick={() => onAsk("Explain the unmatched population in this join and compare the research consequence of inner versus left join for the measured coverage.")}
          >
            Ask about this join
          </button>
        </footer>
      ) : null}
    </section>
  );
}

export default JoinDecisionPanel;
