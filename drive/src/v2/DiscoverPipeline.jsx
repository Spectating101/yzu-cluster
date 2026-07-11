/** Discover acquisition overview — static process map (D1.1). D4 owns live lifecycle. */

const STEPS = [
  { id: "search", label: "Search" },
  { id: "inspect", label: "Inspect" },
  { id: "collect", label: "Collect" },
  { id: "lab", label: "Lab" },
];

export function DiscoverPipeline({ counts }) {
  const hasCounts = counts && counts.total > 0;

  return (
    <section className="rd-v2-discover-pipeline rd-v2-discover-pipeline-overview" aria-label="Acquisition overview">
      <p className="rd-v2-discover-pipeline-kicker">Process overview · not live job status</p>
      <div className="rd-v2-discover-pipeline-steps" aria-hidden="true">
        {STEPS.map((step, index) => (
          <span key={step.id}>
            <b>{index + 1}</b>
            {step.label}
          </span>
        ))}
      </div>
      {hasCounts ? (
        <div className="rd-v2-discover-pipeline-counts">
          <span>{counts.queryReady || 0} query ready</span>
          <span>{counts.inLab || 0} in lab</span>
          <span>{counts.external || 0} external</span>
          {(counts.needsAccess || 0) > 0 ? <span>{counts.needsAccess} need access</span> : null}
        </div>
      ) : (
        <p className="rd-v2-discover-pipeline-lead">
          Search → Inspect → Collect → Lab — explanatory map only until live job state exists.
        </p>
      )}
    </section>
  );
}
