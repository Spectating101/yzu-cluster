import { DISCOVER_SUGGESTIONS } from "@/v2/deskSeed";

/**
 * Discover Explore empty / starter — DISCOVER_FULL_SCALE_FREEZE.
 * Centre owns the evidence-need field; starters are shortcuts only.
 * Fill first viewport with need + method cue + starter ledger (no giant empty canvas).
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
        <form
          className="rd-v2-discover-need-form"
          data-testid="discover-need-form"
          onSubmit={(event) => {
            event.preventDefault();
            const next = String(event.currentTarget.elements.need?.value || "").trim();
            if (next) onSuggest?.(next);
          }}
        >
          <textarea
            name="need"
            className="rd-v2-discover-need-input"
            data-testid="discover-need-query"
            rows={1}
            placeholder="Describe the evidence need — keyword, gap, or research question…"
            aria-label="Evidence need"
          />
          <button type="submit" className="rd-v2-btn sm primary" aria-label="Search evidence need">
            Search
          </button>
        </form>
      </header>

      <ol className="rd-v2-discover-method-cue" aria-label="How Discover works">
        <li>
          <strong>1 · Need</strong>
          <span>State the evidence gap in research language.</span>
        </li>
        <li>
          <strong>2 · Rank</strong>
          <span>Lab holdings first, then external candidates.</span>
        </li>
        <li>
          <strong>3 · Evaluate</strong>
          <span>Detail owns fit, unknowns, and one primary action.</span>
        </li>
      </ol>

      <section className="rd-v2-discover-explore-starters" aria-label="Suggested evidence needs">
        <span className="rd-v2-eyebrow">Suggested needs</span>
        <ul className="rd-v2-discover-starter-list">
          {suggestions.slice(0, 6).map((s) => (
            <li key={s}>
              <button type="button" className="rd-v2-discover-starter-row" onClick={() => onSuggest?.(s)}>
                <strong>{s}</strong>
                <em>Search →</em>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
