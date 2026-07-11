/** Discover acquisition overview — process map, not live lifecycle (D1). */

const STEPS = [
  { id: "search", label: "Search" },
  { id: "inspect", label: "Inspect" },
  { id: "collect", label: "Collect" },
  { id: "lab", label: "Lab" },
];

/**
 * Overview only: highlight the earliest stage that still has work in the result set.
 * Does not claim Approve/Running/Failed completion (those need D4).
 */
function overviewStep(counts = {}, searching = false) {
  if (searching) return 0;
  if ((counts.inLab || 0) > 0 && (counts.external || 0) === 0) return 3;
  if ((counts.acquirable || 0) > 0 || (counts.queued || 0) > 0) return 2;
  if ((counts.external || 0) > 0) return 1;
  return 0;
}

export function DiscoverPipeline({ counts, searching = false }) {
  const active = overviewStep(counts, searching);
  const hasCounts = counts && counts.total > 0;

  return (
    <section className="rd-v2-discover-pipeline rd-v2-discover-pipeline-overview" aria-label="Acquisition overview">
      <p className="rd-v2-discover-pipeline-kicker">Process overview · not live job status</p>
      <div className="rd-v2-discover-pipeline-steps">
        {STEPS.map((step, index) => (
          <span
            key={step.id}
            className={[index < active ? "done" : "", index === active ? "on" : ""]
              .filter(Boolean)
              .join(" ")}
          >
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
          Search holdings and public sources, inspect what you can use, then collect into the lab when a route exists.
        </p>
      )}
    </section>
  );
}
