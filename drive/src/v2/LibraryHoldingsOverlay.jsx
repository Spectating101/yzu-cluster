import { useEffect, useRef } from "react";
import {
  holdingAccessLabel,
  holdingRoleLabel,
  holdingStateLabel,
  summarizeLibraryHoldings,
} from "@/v2/libraryHoldings";

function HoldingCard({ holding }) {
  const access = holdingAccessLabel(holding);
  const state = holdingStateLabel(holding);
  const hasIntegrityDetails = Boolean(holding.version || holding.contentHash || holding.updatedAt);
  return (
    <article className="rd-v2-library-holding-card" data-access={holding.access} data-state={holding.state}>
      <header>
        <div>
          <span className="rd-v2-eyebrow">{holdingRoleLabel(holding)}</span>
          <h3>{holding.provider}</h3>
          {holding.custodian ? <p>{holding.custodian}</p> : null}
        </div>
        <div className="rd-v2-library-holding-status" aria-label={`${access}; ${state}`}>
          <span>{access}</span>
          <span>{state}</span>
        </div>
      </header>
      {holding.location ? (
        <div className="rd-v2-library-holding-location">
          <span>Location</span>
          <code>{holding.location}</code>
        </div>
      ) : null}
      {hasIntegrityDetails ? (
        <details className="rd-v2-library-holding-integrity">
          <summary>Integrity details</summary>
          <dl className="rd-v2-library-holding-meta">
            {holding.version ? <div><dt>Version</dt><dd>{holding.version}</dd></div> : null}
            {holding.updatedAt ? <div><dt>Observed</dt><dd>{holding.updatedAt}</dd></div> : null}
            {holding.contentHash ? <div><dt>Content identity</dt><dd><code>{holding.contentHash}</code></dd></div> : null}
          </dl>
        </details>
      ) : null}
    </article>
  );
}

export function LibraryHoldingsOverlay({ open, dataset, onClose }) {
  const closeButtonRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const summary = summarizeLibraryHoldings(dataset);

  useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey, true);
      const previousFocus = restoreFocusRef.current;
      window.requestAnimationFrame(() => {
        if (previousFocus?.isConnected) previousFocus.focus?.();
      });
    };
  }, [open, onClose]);

  if (!open || !dataset || !summary.count) return null;

  return (
    <div
      className="rd-v2-library-overlay-scrim"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <section
        className="rd-v2-library-overlay rd-v2-library-holdings-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Holdings"
        data-testid="library-holdings-overlay"
      >
        <header>
          <div>
            <span className="rd-v2-eyebrow">Federated Library</span>
            <h2>Holdings</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="rd-v2-btn sm"
            onClick={onClose}
            aria-label="Close holdings"
          >
            Close
          </button>
        </header>

        <p>
          Where this research object is held now. These locations describe copies, custodians, and access; they do not change where the evidence originally came from.
        </p>

        <div className="rd-v2-library-holdings-summary" data-testid="library-holdings-summary">
          <div>
            <span>Known locations</span>
            <strong>{summary.count}</strong>
          </div>
          <div>
            <span>Available to you</span>
            <strong>{summary.availableCount}</strong>
          </div>
          <div>
            <span>Restricted</span>
            <strong>{summary.restrictedCount}</strong>
          </div>
        </div>

        <div className="rd-v2-library-holding-list">
          {summary.holdings.map((holding) => <HoldingCard key={holding.id} holding={holding} />)}
        </div>
      </section>
    </div>
  );
}
