
function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

export function DiscoverEvidenceField({
  candidateCount = 0,
  resultGroups = {},
  assessmentActive = false,
  assessmentResult = null,
  onReviewAssembly,
}) {
  const context = count(resultGroups.context);
  const assessmentStatus = String(assessmentResult?.assessment_status || "").toLowerCase();
  const verdict = String(assessmentResult?.verdict || "").toLowerCase();
  const hasGap = assessmentStatus === "assessed"
    && ["partially_covered", "partial", "not_covered", "uncovered"].includes(verdict)
    && Boolean(assessmentResult?.gap);
  const composable = hasGap && candidateCount > 1;

  const checking = assessmentActive && !assessmentResult;
  const referencesOnly = candidateCount === 0 && context > 0;
  if (!composable && !checking && !referencesOnly) return null;

  return (
    <section className="rd-v2-discover-field" data-testid="discover-evidence-field" aria-label="Discover evidence field">
      {referencesOnly ? (
        <header>
          <div>
            <strong>No collection-ready route yet</strong>
            <p>{`${context} relevant reference${context === 1 ? " is" : "s are"} available to inspect or test its connection.`}</p>
          </div>
        </header>
      ) : null}
      {composable ? (
        <div className="rd-v2-discover-assembly" data-testid="discover-assembly-path">
          <div className="rd-v2-discover-assembly-mark" aria-hidden="true">∑</div>
          <div>
            <span>Proposed assembly path</span>
            <strong>No single source has to be the answer.</strong>
            <p>
              {candidateCount} candidate inputs are shown while the assessment still reports a gap. Compare their coverage before deciding what to collect, check, or save to Library as a new dataset.
            </p>
          </div>
          <div className="rd-v2-discover-assembly-state">
            <span>Current verification</span>
            <b>Proposed, not executed</b>
            {onReviewAssembly ? <button type="button" onClick={onReviewAssembly}>Review assembly plan →</button> : null}
          </div>
        </div>
      ) : checking ? (
        <div className="rd-v2-discover-assembly is-checking" role="status">
          <div className="rd-v2-discover-assembly-mark" aria-hidden="true">…</div>
          <div>
            <span>Assembly position</span>
            <strong>Checking whether one source is enough.</strong>
            <p>Results remain available while data in your Library is compared with your research brief.</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
