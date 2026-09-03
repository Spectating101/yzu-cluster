import { FolderOpen } from "lucide-react";

export function EmptyRailState({
  title = "No dataset selected",
  hint = "Select a row in the catalog to inspect metadata, preview rows, or ask about procurement.",
}) {
  const discoverIdle = title === "No candidate selected";

  if (discoverIdle) {
    return (
      <div className="rd-v2-rail-empty-state rd-v2-discover-idle-rail" role="status" data-empty-kind="discover-idle">
        <p className="rd-v2-rail-empty-title">Decision preview</p>

        <section className="rd-v2-discover-idle-rail-card is-compare" aria-label="Evidence comparison preview">
          <span className="rd-v2-eyebrow">01 · Evidence comparison</span>
          <div className="rd-v2-discover-idle-compare-pair">
            <span>
              <small>In Library</small>
              <strong>known coverage</strong>
            </span>
            <i aria-hidden="true">→</i>
            <span>
              <small>Candidate</small>
              <strong>added evidence</strong>
            </span>
          </div>
        </section>

        <section className="rd-v2-discover-idle-rail-card is-proof" aria-label="Source proof preview">
          <span className="rd-v2-eyebrow">02 · Source proof</span>
          <div className="rd-v2-discover-idle-proof-grid">
            <span><b>Observed</b><em>inspected facts</em></span>
            <span><b>Declared</b><em>source metadata</em></span>
            <span><b>Unknown</b><em>not verified</em></span>
          </div>
        </section>

        <section className="rd-v2-discover-idle-rail-card is-gap" aria-label="Evidence gap preview">
          <span className="rd-v2-eyebrow">03 · Precise gap</span>
          <strong>Missing grain / field / period / access</strong>
          <p>Named explicitly before a new sourcing route is proposed.</p>
        </section>

        <section className="rd-v2-discover-idle-rail-card is-output" aria-label="Reviewable outcome preview">
          <span className="rd-v2-eyebrow">04 · Reviewable output</span>
          <div className="rd-v2-discover-idle-output-flow" aria-label="Review path">
            <span>Dataset shape</span><i>→</i><span>Route</span><i>→</i><span>Approval</span><i>→</i><span>Library</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="rd-v2-rail-empty-state" role="status">
      <FolderOpen className="rd-v2-rail-empty-icon" size={40} strokeWidth={1.25} aria-hidden />
      <p className="rd-v2-rail-empty-title">{title}</p>
      <p className="rd-v2-rail-empty-hint">{hint}</p>
    </div>
  );
}
