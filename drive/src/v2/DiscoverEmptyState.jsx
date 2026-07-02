import { DISCOVER_SUGGESTIONS } from "@/v2/deskSeed";
import { Chip, ChipRow } from "@/v2/ui";

export function DiscoverEmptyState({ onSuggest }) {
  const suggestions = DISCOVER_SUGGESTIONS.length
    ? DISCOVER_SUGGESTIONS
    : ["TWSE governance", "MOPS filings", "stablecoin"];

  return (
    <div className="rd-v2-discover-empty" data-testid="discover-empty">
      <div className="rd-v2-discover-empty-icon" aria-hidden>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" strokeLinecap="round" />
        </svg>
      </div>
      <h2>Discover external datasets</h2>
      <p>
        Search the header bar to find datasets outside your lab vault — TWSE, MOPS, DataCite, and registry
        sources. Select a row to procure into the vault.
      </p>
      <p className="rd-v2-discover-empty-hint">Try a suggested query:</p>
      <ChipRow>
        {suggestions.map((s) => (
          <Chip key={s} active onClick={() => onSuggest?.(s)}>
            {s}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}
