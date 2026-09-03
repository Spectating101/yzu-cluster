import { FolderOpen } from "lucide-react";

export function EmptyRailState({
  title = "No dataset selected",
  hint = "Select a row in the catalog to inspect metadata, preview rows, or ask about procurement.",
}) {
  const discoverIdle = title === "No candidate selected";

  if (discoverIdle) {
    return (
      <div className="rd-v2-rail-empty-state rd-v2-discover-idle-rail" role="status" data-empty-kind="discover-idle">
        <header className="rd-v2-discover-idle-rail-head">
          <span className="rd-v2-eyebrow">Decision preview</span>
          <strong>What the Detail rail will establish</strong>
          <p>One candidate at a time: fit, proof, gap, output shape, then a reviewable next action.</p>
        </header>

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
            <span><b>Observed</b><em>preview / probe</em></span>
            <span><b>Declared</b><em>source metadata</em></span>
            <span><b>Unknown</b><em>not verified</em></span>
          </div>
        </section>

        <section className="rd-v2-discover-idle-rail-card is-gap" aria-label="Evidence gap preview">
          <span className="rd-v2-eyebrow">03 · Precise gap</span>
          <strong>Missing grain / field / period / access</strong>
          <p>The unresolved requirement stays explicit instead of being hidden behind a generic relevance score.</p>
        </section>

        <section className="rd-v2-discover-idle-rail-card is-output-shape" aria-label="Proposed dataset preview">
          <span className="rd-v2-eyebrow">04 · Proposed dataset</span>
          <div className="rd-v2-discover-idle-shape">
            <strong>exchange × stablecoin × day</strong>
            <span>price · volume · flow · event day</span>
          </div>
          <p>Only the missing evidence is shaped into a new research asset.</p>
        </section>

        <section className="rd-v2-discover-idle-rail-card is-output" aria-label="Reviewable outcome preview">
          <span className="rd-v2-eyebrow">05 · Review boundary</span>
          <div className="rd-v2-discover-idle-output-flow" aria-label="Review path">
            <span>Preview</span><i>→</i><span>Route</span><i>→</i><span>Approval</span><i>→</i><span>Library</span>
          </div>
          <p>No collection begins from the idle state or from source inspection.</p>
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
