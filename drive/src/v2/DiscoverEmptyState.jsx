import { useState } from "react";
import { DISCOVER_SUGGESTIONS } from "@/v2/deskSeed";

const SOURCE_FAMILIES = [
  ["Lab catalog", "Start with registered holdings and query-ready evidence."],
  ["Public registries", "Search TWSE, MOPS, SEC, DataCite, and supported indexes."],
  ["Agent investigation", "Describe a research question and let the desk compare supported routes."],
];

export function DiscoverEmptyState({ onSuggest }) {
  const [query, setQuery] = useState("");
  const suggestions = DISCOVER_SUGGESTIONS.length
    ? DISCOVER_SUGGESTIONS
    : ["TWSE governance", "MOPS filings", "stablecoin incidents"];

  const submit = (event) => {
    event.preventDefault();
    const value = query.trim();
    if (value) onSuggest?.(value);
  };

  return (
    <section className="rd-v2-discover-empty rd-recovery-discover-start" data-testid="discover-empty" aria-label="Discover catalog start">
      <div className="rd-recovery-discover-copy">
        <span>Catalog and research question</span>
        <h2>Find evidence beyond the current vault</h2>
        <p>Search directly, browse a proven source family, or describe the research need in ordinary language. The lab catalog remains the first stop.</p>
      </div>

      <form className="rd-recovery-discover-search" onSubmit={submit}>
        <label htmlFor="discover-start-query">Research question or dataset</label>
        <div>
          <input
            id="discover-start-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search datasets, sources, variables, or a research idea…"
            autoComplete="off"
          />
          <button type="submit" className="rd-v2-btn sm primary" disabled={!query.trim()}>Search catalog</button>
        </div>
      </form>

      <div className="rd-recovery-discover-families" aria-label="Available evidence landscape">
        {SOURCE_FAMILIES.map(([title, detail]) => (
          <article key={title}>
            <strong>{title}</strong>
            <span>{detail}</span>
          </article>
        ))}
      </div>

      <div className="rd-recovery-discover-suggestions">
        <span>Suggested for your lab</span>
        <div>
          {suggestions.slice(0, 6).map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => onSuggest?.(suggestion)}>
              <strong>{suggestion}</strong>
              <small>Open this evidence landscape →</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
