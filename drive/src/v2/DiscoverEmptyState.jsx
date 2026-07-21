import { DISCOVER_SUGGESTIONS } from "@/v2/deskSeed";

/**
 * Discover Explore empty / starter — toward DISCOVER_FULL_SCALE_FREEZE Explore wireframe.
 * Not a giant marketing card: evidence-need prompt + ranked starter lanes.
 */
export function DiscoverEmptyState({ onSuggest }) {
  const suggestions = DISCOVER_SUGGESTIONS.length
    ? DISCOVER_SUGGESTIONS
    : ["TWSE governance", "MOPS filings", "stablecoin", "Indonesia IDX", "GDELT news shocks"];

  return (
    <div className="rd-v2-discover-explore-start" data-testid="discover-empty">
      <header className="rd-v2-discover-explore-need">
        <span className="rd-v2-eyebrow">Explore</span>
        <h2>What evidence are you looking for?</h2>
        <p>
          Use the header search to describe the evidence need. Results stay ranked in this centre;
          Detail judges the selected source.
        </p>
        <p className="rd-v2-discover-explore-hint muted">
          Search the header bar — TWSE, MOPS, DataCite, registry sources, and lab overlap.
        </p>
      </header>

      <section className="rd-v2-discover-explore-starters" aria-label="Suggested evidence needs">
        <div className="rd-v2-home-section-head">
          <h3>Try a grounded starter</h3>
        </div>
        <ul className="rd-v2-discover-starter-list">
          {suggestions.slice(0, 6).map((s) => (
            <li key={s}>
              <button type="button" className="rd-v2-discover-starter-row" onClick={() => onSuggest?.(s)}>
                <strong>{s}</strong>
                <span>Interpret as an evidence need and rank candidates</span>
                <em>Search →</em>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
