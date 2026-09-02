import "./discover-evidence-field.css";
import "./discover-scale-polish.css";
import "./discover-efficiency-polish.css";
import "./discover-scan-polish.css";
import "./discover-workstation-polish.css";

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

export function DiscoverEvidenceField({
  query,
  candidateCount = 0,
  resultGroups = {},
  assessmentActive = false,
  assessmentResult = null,
  onReviewAssembly,
  onSearchWider,
}) {
  const held = count(resultGroups.held);
  const available = count(resultGroups.available);
  const verify = count(resultGroups.external);
  const context = count(resultGroups.context);
  const assessmentStatus = String(assessmentResult?.assessment_status || "").toLowerCase();
  const verdict = String(assessmentResult?.verdict || "").toLowerCase();
  const hasGap = assessmentStatus === "assessed"
    && ["partially_covered", "partial", "not_covered", "uncovered"].includes(verdict)
    && Boolean(assessmentResult?.gap);
  const composable = hasGap && candidateCount > 1;

  return (
    <section className="rd-v2-discover-field" data-testid="discover-evidence-field" aria-label="Discover evidence field">
      <header>
        <div>
          <span className="rd-v2-eyebrow">Candidate field</span>
          <strong>{candidateCount} candidate{candidateCount === 1 ? "" : "s"}</strong>
          <p>Compare, combine, or synthesize from the field.</p>
        </div>
        <div className="rd-v2-discover-field-actions">
          {onSearchWider ? <button type="button" onClick={() => onSearchWider(query)}>Search wider</button> : null}
        </div>
      </header>

      <div className="rd-v2-discover-field-metrics" aria-label="Evidence field composition">
        <span><b>{available}</b><em>acquirable</em></span>
        <span><b>{verify}</b><em>to verify</em></span>
        <span><b>{held}</b><em>held evidence</em></span>
        <span><b>{context}</b><em>references</em></span>
      </div>

      {composable ? (
        <div className="rd-v2-discover-assembly" data-testid="discover-assembly-path">
          <div className="rd-v2-discover-assembly-mark" aria-hidden="true">∑</div>
          <div>
            <span>Proposed assembly path</span>
            <strong>No single source has to be the answer.</strong>
            <p>
              {candidateCount} candidate inputs are in the current field while the assessment still records an open gap.
              Compare complementary coverage before deciding what should be collected, reconciled, or registered as a new dataset.
            </p>
          </div>
          <div className="rd-v2-discover-assembly-state">
            <span>Current authority</span>
            <b>Proposed, not executed</b>
            {onReviewAssembly ? <button type="button" onClick={onReviewAssembly}>Review assembly plan →</button> : null}
          </div>
        </div>
      ) : assessmentActive && !assessmentResult ? (
        <div className="rd-v2-discover-assembly is-checking" role="status">
          <div className="rd-v2-discover-assembly-mark" aria-hidden="true">…</div>
          <div>
            <span>Assembly position</span>
            <strong>Checking whether one source is enough.</strong>
            <p>The field remains usable while held evidence and the research brief are compared.</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
