import { discoverSuggestedQueries } from "@/v2/discoverPrompts";
import { Chip, ChipRow } from "@/v2/ui";

/**
 * Compact GDS-first empty Discover: chips under the stable toolbar, then a dense suggest strip.
 * Approvals stay interrupt-only (header pending) — no mid-page inbox banner.
 */
export function DiscoverEmptyState({
  profile = null,
  onSuggest,
  children = null,
}) {
  const { profileQueries, commonQueries } = discoverSuggestedQueries(profile);
  const hasProfile = profileQueries.length > 0;
  const chipQueries = hasProfile
    ? [...profileQueries.slice(0, 3), ...commonQueries.slice(0, 3)]
    : commonQueries;

  return (
    <div className="rd-v2-discover-empty rd-v2-discover-empty--gds" data-testid="discover-empty">
      <div className="rd-v2-discover-empty-hero">
        <div className="rd-v2-discover-empty-group">
          <p className="rd-v2-discover-empty-hint">Try</p>
          <ChipRow>
            {chipQueries.map((s) => (
              <Chip key={s} onClick={() => onSuggest?.(s)}>
                {s}
              </Chip>
            ))}
          </ChipRow>
        </div>

        {hasProfile ? (
          <div className="rd-v2-discover-empty-group" data-testid="discover-profile-suggestions">
            <p className="rd-v2-discover-empty-hint">
              For {profile?.name_en || profile?.name || "your profile"}
            </p>
            <ChipRow>
              {profileQueries.map((s) => (
                <Chip key={`p-${s}`} active onClick={() => onSuggest?.(s)}>
                  {s}
                </Chip>
              ))}
            </ChipRow>
          </div>
        ) : (
          <div data-testid="discover-profile-suggestions" hidden aria-hidden="true" />
        )}
      </div>

      {children}
    </div>
  );
}

/** Dense suggested shortlist — not SERP rows, not card chrome. Single-click commits search. */
export function DiscoverSuggestedCards({
  rows = [],
  labIds,
  onSearchTitle,
}) {
  if (!rows.length) return null;

  return (
    <div className="rd-v2-discover-suggested-cards" data-testid="discover-suggested">
      <p className="rd-v2-discover-empty-hint">Suggested for your lab</p>
      <ul className="rd-v2-discover-suggest-list" aria-label="Suggested datasets">
        {rows.map((row) => {
          const id = row.dataset_id || row.title || row.name;
          const title = row.title || row.name || id;
          const inLab = Boolean(row.dataset_id && labIds?.has?.(row.dataset_id)) || row.kind === "lab";
          const source = row.source || row.publisher || row.backend || row.collect_via || "";
          return (
            <li key={String(id)}>
              <button
                type="button"
                className="rd-v2-discover-suggest-row"
                data-testid="discover-suggested-card"
                data-kind={inLab ? "lab" : "external"}
                onClick={() => onSearchTitle?.(title)}
              >
                <span className="rd-v2-discover-suggest-main">
                  <strong>{title}</strong>
                  {source ? <span className="rd-v2-discover-suggest-meta">{source}</span> : null}
                </span>
                <span className={inLab ? "lab" : "ext"}>{inLab ? "In lab" : "External"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
