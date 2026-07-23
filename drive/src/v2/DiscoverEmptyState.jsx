import { useMemo, useState } from "react";
import { DISCOVER_SUGGESTIONS } from "@/v2/deskSeed";

const SOURCE_FAMILIES = [
  ["01", "Held evidence", "Inspect registered assets and query-ready panels before sourcing more."],
  ["02", "Source routes", "Compare authoritative registries, access conditions, coverage, and grain."],
  ["03", "Controlled acquisition", "Probe, review, approve, collect, verify, and register durable evidence."],
];

const SUGGESTION_DETAILS = {
  "TWSE governance": ["Board, ownership, disclosure, and governance signals", "TWSE / MOPS · external"],
  "MOPS filings": ["Filings, amendments, issuer disclosures, and relationships", "MOPS · external"],
  "stablecoin incidents": ["Incident timing, attention, peg stress, and adoption evidence", "Research indexes · external"],
  "Indonesia IDX": ["Issuer, market, and microstructure evidence already relevant to the lab", "Lab holdings"],
  "Refinitiv PIT membership": ["Point-in-time index membership and constituent history", "Licensed route · access review"],
  "GDELT news shocks": ["Country-day news intensity and event-shock measures", "Lab holding / GDELT"],
};

function suggestionDetail(suggestion, index) {
  return SUGGESTION_DETAILS[suggestion] || [
    index === 3 ? "Inspect the strongest held evidence before widening the search" : "Compare relevance, access, coverage, and acquisition route",
    index === 3 ? "Lab holdings" : "Supported source route",
  ];
}

export function DiscoverEmptyState({ onSuggest }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("catalog");
  const suggestions = useMemo(
    () => DISCOVER_SUGGESTIONS.length
      ? DISCOVER_SUGGESTIONS
      : ["TWSE governance", "MOPS filings", "stablecoin incidents"],
    [],
  );

  const submit = (event) => {
    event.preventDefault();
    const value = query.trim();
    if (value) onSuggest?.(value);
  };

  return (
    <section className="rd-v2-discover-empty rd-recovery-discover-start rd-convergence-discover-start" data-testid="discover-empty" aria-label="Discover evidence start">
      <div className="rd-convergence-discover-intro">
        <span>Evidence discovery</span>
        <h2>Search what the lab already holds—then widen the evidence space.</h2>
        <p>Begin with a dataset, field, source, or research question. Discover checks held evidence first and keeps external candidates separate until collection and registration succeed.</p>
      </div>

      <div className="rd-convergence-discover-toolbar">
        <div className="rd-convergence-discover-mode" role="group" aria-label="Discover search mode">
          <button type="button" className={mode === "catalog" ? "active" : ""} onClick={() => setMode("catalog")}>Dataset or source</button>
          <button type="button" className={mode === "question" ? "active" : ""} onClick={() => setMode("question")}>Research need</button>
        </div>
        <form className="rd-recovery-discover-search" onSubmit={submit}>
          <label htmlFor="discover-start-query">Research question or dataset</label>
          <div>
            <span className="rd-convergence-discover-search-icon" aria-hidden>⌕</span>
            <input
              id="discover-start-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={mode === "catalog" ? "Search holdings, registries, and supported sources…" : "Describe the evidence your research needs…"}
              autoComplete="off"
            />
            <button type="submit" className="rd-v2-btn sm primary" disabled={!query.trim()}>Search evidence</button>
          </div>
        </form>
      </div>

      <div className="rd-convergence-discover-try">
        <span>Start with a concrete need</span>
        <div>
          {suggestions.slice(0, 6).map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => onSuggest?.(suggestion)}>{suggestion}</button>
          ))}
        </div>
      </div>

      <div className="rd-recovery-discover-suggestions rd-convergence-discover-suggestions">
        <div className="rd-convergence-discover-section-head">
          <span>Suggested investigations</span>
          <p>Open a bounded evidence question rather than a generic web search.</p>
        </div>
        <div>
          {suggestions.slice(0, 4).map((suggestion, index) => {
            const [detail, route] = suggestionDetail(suggestion, index);
            return (
              <button
                key={`${suggestion}-${index}`}
                type="button"
                aria-label={`Investigate ${suggestion}`}
                onClick={() => onSuggest?.(suggestion)}
              >
                <span className="rd-convergence-suggestion-route">{route}</span>
                <strong>{suggestion}</strong>
                <small>{detail}</small>
                <em>Investigate →</em>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rd-recovery-discover-families rd-convergence-discover-families" role="region" aria-label="Evidence discovery workflow">
        {SOURCE_FAMILIES.map(([number, title, detail]) => (
          <article key={title}>
            <b>{number}</b>
            <div><strong>{title}</strong><span>{detail}</span></div>
          </article>
        ))}
      </div>
      <p className="rd-convergence-discover-truth">External candidates remain prospective evidence until access, collection, archive, and registry proof are complete.</p>
    </section>
  );
}
