import { shortHash } from "./threadRecord.js";

export function ProvenancePanel({ provenance, onViewCode, onDownload, onCite }) {
  if (!provenance?.method_hash) return null;
  const inputs = Array.isArray(provenance.inputs) ? provenance.inputs : [];

  return (
    <section className="s04-card" data-testid="synthesis-provenance">
      <header className="s04-title">
        <div>
          <small>Provenance</small>
          <h2>{shortHash(provenance.method_hash)}</h2>
        </div>
        {provenance.archive_verified ? <em className="success">archive verified</em> : null}
      </header>

      <dl className="s04-method">
        <div><dt>Built</dt><dd>{provenance.built_at || "not reported"}</dd></div>
        <div><dt>Job</dt><dd>{provenance.job_id || "not reported"}</dd></div>
        <div><dt>Manifest</dt><dd>{provenance.manifest_id || "not reported"}</dd></div>
      </dl>

      {inputs.length ? (
        <div className="s04-options">
          <small>Inputs — verify these fingerprints before trusting a reproduction</small>
          <ul>
            {inputs.map((input) => (
              <li key={input.dataset_id || input.fingerprint}>
                <b>{input.dataset_id}</b>
                <span>
                  <strong>{shortHash(input.fingerprint)}</strong>
                  <small>
                    {[input.files ? `${input.files} file${input.files === 1 ? "" : "s"}` : "",
                      input.bytes ? `${Number(input.bytes).toLocaleString()} bytes` : ""]
                      .filter(Boolean).join(" · ")}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {provenance.code_excerpt ? (
        <pre className="s04-code" data-testid="synthesis-provenance-code">{provenance.code_excerpt}</pre>
      ) : null}

      <footer className="s04-actions">
        <p>
          <small>Citable</small>
          This is the method a reviewer would re-run, not a description of it.
        </p>
        <button type="button" className="rd-v2-btn" onClick={() => onViewCode?.(provenance)}>View method as code</button>
        <button type="button" className="rd-v2-btn" onClick={() => onDownload?.(provenance)}>Download</button>
        <button type="button" className="rd-v2-btn primary" onClick={() => onCite?.(provenance)}>Copy citation</button>
      </footer>
    </section>
  );
}

export default ProvenancePanel;
