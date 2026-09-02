import { useState } from "react";
import "./discover-evidence-field.css";
import "./discover-scale-polish.css";
import "./discover-efficiency-polish.css";
import "./discover-scan-polish.css";
import "./discover-workstation-polish.css";
import "./discover-resting-polish.css";
import "./discover-rail-balance.css";
import "./discover-utility-workbench.css";

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function candidateTitle(row) {
  return row?.title || row?.name || row?.dataset_id || row?.source_id || "Candidate";
}

function candidateProvider(row) {
  return row?.provider || row?.publisher || row?.source || row?.backend || row?.collect_via || "Source";
}

function candidateType(row) {
  const kind = String(row?.kind || row?.type || row?.artifact_type || "").toLowerCase();
  if (/api|connector|endpoint/.test(kind)) return "API / connector";
  if (/registry|dataset|source/.test(kind)) return "Dataset / catalogue";
  if (/paper|article|publication/.test(kind)) return "Reference";
  return row?.kind || row?.type || "Dataset";
}

function candidateCoverage(row) {
  return row?.coverage || row?.coverage_summary || row?.temporal_coverage || "Not described";
}

function candidateRefresh(row) {
  return row?.refresh_frequency || row?.refresh || row?.update_frequency || "Not recorded";
}

function candidateRoute(row) {
  const route = row?.collect_via || row?.source_route || row?.access_mode;
  if (!route) return "Not established";
  return String(route).replaceAll("_", " ");
}

function candidateObservation(row) {
  if (row?.probe_snapshot?.observed_at) return "Probe observed";
  if (Number(row?.query_relevance) > 0 || row?.match_mode) return "Route matched";
  return "Not observed";
}

function ComparisonMatrix({ candidates }) {
  if (!candidates.length) return null;
  const fields = [
    ["Evidence type", candidateType],
    ["Coverage", candidateCoverage],
    ["Refresh", candidateRefresh],
    ["Route", candidateRoute],
    ["Verification", candidateObservation],
  ];

  return (
    <div className="rd-v2-discover-utility-matrix" data-testid="discover-utility-matrix">
      <div className="rd-v2-discover-utility-matrix-head">
        <div>
          <span className="rd-v2-eyebrow">Candidate comparison</span>
          <strong>{candidates.length} leading inputs, aligned</strong>
        </div>
        <p>Only recorded source metadata is compared here; blank or unknown fields are not treated as absence.</p>
      </div>
      <div
        className="rd-v2-discover-utility-grid"
        style={{ "--rd-utility-cols": candidates.length }}
        role="table"
        aria-label="Candidate comparison matrix"
      >
        <div className="rd-v2-discover-utility-grid-corner" role="columnheader">Field</div>
        {candidates.map((candidate) => (
          <div key={`head:${candidateTitle(candidate)}`} className="rd-v2-discover-utility-grid-source" role="columnheader">
            <b>{candidateProvider(candidate)}</b>
            <span>{candidateTitle(candidate)}</span>
          </div>
        ))}
        {fields.flatMap(([label, getter]) => [
          <div key={`label:${label}`} className="rd-v2-discover-utility-grid-label" role="rowheader">{label}</div>,
          ...candidates.map((candidate) => (
            <div key={`${label}:${candidateTitle(candidate)}`} className="rd-v2-discover-utility-grid-value" role="cell">
              {getter(candidate)}
            </div>
          )),
        ])}
      </div>
    </div>
  );
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
  const [view, setView] = useState("ledger");
  const availableRows = rows(resultGroups.available);
  const verifyRows = rows(resultGroups.external);
  const heldRows = rows(resultGroups.held);
  const contextRows = rows(resultGroups.context);
  const held = heldRows.length;
  const available = availableRows.length;
  const verify = verifyRows.length;
  const context = contextRows.length;
  const assessmentStatus = String(assessmentResult?.assessment_status || "").toLowerCase();
  const verdict = String(assessmentResult?.verdict || "").toLowerCase();
  const hasGap = assessmentStatus === "assessed"
    && ["partially_covered", "partial", "not_covered", "uncovered"].includes(verdict)
    && Boolean(assessmentResult?.gap);
  const composable = hasGap && candidateCount > 1;
  const matrixCandidates = [...availableRows, ...verifyRows].slice(0, 3);

  return (
    <section className="rd-v2-discover-field rd-v2-discover-field--utility" data-testid="discover-evidence-field" aria-label="Discover evidence field">
      <header>
        <div>
          <span className="rd-v2-eyebrow">Candidate field</span>
          <strong>{candidateCount} candidate{candidateCount === 1 ? "" : "s"}</strong>
          <p>Work the evidence set first; open individual sources only when detail is needed.</p>
        </div>
        <div className="rd-v2-discover-field-actions rd-v2-discover-utility-actions">
          <div className="rd-v2-discover-view-switch" role="group" aria-label="Evidence field view">
            <button type="button" className={view === "ledger" ? "on" : ""} aria-pressed={view === "ledger"} onClick={() => setView("ledger")}>Ledger</button>
            <button type="button" className={view === "matrix" ? "on" : ""} aria-pressed={view === "matrix"} onClick={() => setView("matrix")}>Matrix</button>
          </div>
          {onSearchWider ? <button type="button" onClick={() => onSearchWider(query)}>Search wider</button> : null}
        </div>
      </header>

      <div className="rd-v2-discover-utility-summary" aria-label="Evidence field composition">
        <span><b>{available}</b><em>acquirable</em></span>
        <span><b>{verify}</b><em>to verify</em></span>
        <span><b>{held}</b><em>held evidence</em></span>
        <span><b>{context}</b><em>references</em></span>
        <span className="rd-v2-discover-utility-rule"><b>{candidateCount > 4 ? `${candidateCount}` : "All"}</b><em>remain in ledger</em></span>
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

      {view === "matrix" ? <ComparisonMatrix candidates={matrixCandidates} /> : null}
    </section>
  );
}
