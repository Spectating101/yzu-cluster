import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { displayName } from "@/v2/datasetMeta";
import { libraryPackageDownloadHref, prepareLibraryPackage } from "@/v2/libraryPackageApi";
import "@/v2/library-package.css";

const MAX_DEFAULT_SELECTION = 20;

function assetId(item) {
  const row = item?.row || item || {};
  return String(row.dataset_id || row.id || "").trim();
}

function assetRow(item) {
  return item?.row || item || {};
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

function ResultSummary({ result }) {
  if (!result) return null;
  const included = result.included || [];
  const metadataOnly = result.metadata_only || [];
  const excluded = result.excluded || [];
  const href = libraryPackageDownloadHref(result);
  return (
    <section className="rd-v2-library-package-ready" data-testid="library-package-ready" aria-live="polite">
      <div className="rd-v2-library-package-ready-head">
        <div>
          <span className="rd-v2-eyebrow">Research package ready</span>
          <strong>{included.length} data asset{included.length === 1 ? "" : "s"} · {metadataOnly.length} metadata/access record{metadataOnly.length === 1 ? "" : "s"}</strong>
          <p>{formatBytes(result.data_bytes)} source data · {result.data_file_count || 0} file{result.data_file_count === 1 ? "" : "s"}</p>
        </div>
        {href ? (
          <a className="rd-v2-btn primary" href={href} download data-testid="library-package-download">
            Download package
          </a>
        ) : null}
      </div>
      <div className="rd-v2-library-package-breakdown">
        {included.length ? <span><b>{included.length}</b> included as data</span> : null}
        {metadataOnly.length ? <span><b>{metadataOnly.length}</b> metadata/access only</span> : null}
        {excluded.length ? <span><b>{excluded.length}</b> excluded with reasons</span> : null}
      </div>
      <p className="rd-v2-library-package-boundary">
        This package reflects current Library holdings and verified export paths. It does not by itself establish analytical sufficiency for the research question.
      </p>
    </section>
  );
}

export function LibraryPackagePanel({ open, onClose, researchNeed = "", assets = [], onAsk }) {
  const candidates = useMemo(
    () => assets.map(assetRow).filter((row) => assetId(row)).slice(0, 40),
    [assets],
  );
  const candidateIds = useMemo(() => candidates.map(assetId), [candidates]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedIds(candidateIds.slice(0, MAX_DEFAULT_SELECTION));
    setResult(null);
    setError("");
  }, [candidateIds, open, researchNeed]);

  if (!open || typeof document === "undefined") return null;
  const selectedRows = candidates.filter((row) => selectedIds.includes(assetId(row)));

  const toggle = (id) => {
    setResult(null);
    setError("");
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  const prepare = async () => {
    if (!selectedIds.length || preparing) return;
    setPreparing(true);
    setError("");
    setResult(null);
    try {
      const out = await prepareLibraryPackage({ researchNeed, datasetIds: selectedIds });
      setResult(out);
    } catch (err) {
      setError(err?.message || "Research package preparation failed.");
    } finally {
      setPreparing(false);
    }
  };

  return createPortal(
    <div className="rd-v2-library-package-scrim" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className="rd-v2-library-package-panel" role="dialog" aria-modal="true" aria-label="Prepare research package" data-testid="library-package-panel">
        <header className="rd-v2-library-package-head">
          <div>
            <span className="rd-v2-eyebrow">Library · portable evidence</span>
            <h2>Prepare research package</h2>
            <p>Review the held evidence Library matched. The server will include data only where a verified local export path actually exists.</p>
          </div>
          <button type="button" className="rd-v2-btn ghost sm" onClick={onClose} aria-label="Close research package">Close</button>
        </header>

        <div className="rd-v2-library-package-need" data-testid="library-package-research-need">
          <span>Research request</span>
          <strong>{researchNeed || "Current Library selection"}</strong>
        </div>

        <div className="rd-v2-library-package-list" aria-label="Package evidence selection">
          {candidates.map((row) => {
            const id = assetId(row);
            const checked = selectedIds.includes(id);
            return (
              <label key={id} className={`rd-v2-library-package-row${checked ? " selected" : ""}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(id)} />
                <span>
                  <strong>{displayName(row)}</strong>
                  <em>{id}</em>
                </span>
                <small>{row.search_match?.reasons?.[0]?.label || row.grain || row.source || "Held evidence"}</small>
              </label>
            );
          })}
        </div>

        <footer className="rd-v2-library-package-actions">
          <div>
            <strong>{selectedIds.length} selected</strong>
            <span>Matched and held do not imply downloadable. Package authority is resolved server-side.</span>
          </div>
          <div className="rd-v2-library-package-buttons">
            {onAsk ? (
              <button type="button" className="rd-v2-btn ghost" onClick={() => onAsk(selectedRows)} disabled={!selectedRows.length || preparing}>
                Ask about these
              </button>
            ) : null}
            <button type="button" className="rd-v2-btn primary" onClick={prepare} disabled={!selectedIds.length || preparing} data-testid="library-package-prepare">
              {preparing ? "Preparing…" : "Prepare package"}
            </button>
          </div>
        </footer>

        {error ? <div className="rd-v2-library-package-error" role="alert">{error}</div> : null}
        <ResultSummary result={result} />
      </section>
    </div>,
    document.body,
  );
}
