import { useState } from "react";
import { DISCOVER_SUGGESTIONS } from "@/v2/deskSeed";

const SOURCE_FAMILIES = [
  ["Lab catalog", "Registered holdings first"],
  ["Public registries", "TWSE, MOPS, SEC, DataCite"],
  ["Agent investigation", "Compare supported routes"],
];

export function DiscoverEmptyState({ onSuggest }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("catalog");
  const suggestions = DISCOVER_SUGGESTIONS.length
    ? DISCOVER_SUGGESTIONS
    : ["TWSE governance", "MOPS filings", "stablecoin incidents"];

  const submit = (event) => {
    event.preventDefault();
    const value = query.trim();
    if (value) onSuggest?.(value);
  };

  return (
    <section className="rd-v2-discover-empty rd-recovery-discover-start rd-convergence-discover-start" data-testid="discover-empty" aria-label="Discover catalog start">
      <div className="rd-convergence-discover-toolbar">
        <div className="rd-convergence-discover-mode" role="group" aria-label="Discover search mode">
          <button type="button" className={mode === "catalog" ? "active" : ""} onClick={() => setMode("catalog")}>Catalog</button>
          <button type="button" className={mode === "question" ? "active" : ""} onClick={() => setMode("question")}>Research question</button>
        </div>
        <form className="rd-recovery-discover-search" onSubmit={submit}>
          <label htmlFor="discover-start-query">Research question or dataset</label>
          <div>
            <span className="rd-convergence-discover-search-icon" aria-hidden>⌕</span>
            <input
              id="discover-start-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={mode === "catalog" ? "Search external datasets…" : "Describe the evidence your research needs…"}
              autoComplete="off"
            />
            <button type="button" className="rd-v2-btn sm rd-convergence-filter" aria-label="Filter Discover results">Filter</button>
            <button type="submit" className="rd-v2-btn sm primary" disabled={!query.trim()}>Search catalog</button>
          </div>
        </form>
      </div>

      <div className="rd-convergence-discover-try">
        <span>Try</span>
        <div>
          {suggestions.slice(0, 6).map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => onSuggest?.(suggestion)}>{suggestion}</button>
          ))}
        </div>
      </div>

      <div className="rd-recovery-discover-suggestions rd-convergence-discover-suggestions">
        <span>Suggested for your lab</span>
        <div>
          {suggestions.slice(0, 4).map((suggestion, index) => (
            <button key={`${suggestion}-${index}`} type="button" onClick={() => onSuggest?.(suggestion)}>
              <strong>{suggestion}</strong>
              <small>{index === 3 ? "In lab" : "External"}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="rd-recovery-discover-families rd-convergence-discover-families" role="region" aria-label="Available evidence landscape">
        {SOURCE_FAMILIES.map(([title, detail]) => (
          <article key={title}>
            <strong>{title}</strong>
            <span>{detail}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
