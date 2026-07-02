/** v2 header — docs/design/UX_SPEC_MICRO.md §1.2 */

export function V2DeskHeader({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onAskFromSearch,
  onBrandClick,
  onRetry,
  headerInitials = "YZ",
  datasetCount = 0,
  usingSeed = false,
  workCount = 0,
}) {
  const metaText = usingSeed
    ? `${datasetCount} datasets`
    : workCount > 0
      ? `${datasetCount} datasets · ${workCount} pending`
      : `${datasetCount} datasets`;

  return (
    <header className="yzu-header rd-v2-header">
      <button type="button" className="yzu-brand" onClick={onBrandClick}>
        <span className="rd-brand-mark">RD</span>
        <div className="yzu-brand-text">
          <strong>Research Drive</strong>
        </div>
      </button>
      <div className="rd-search rd-v2-search-pill">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="m21 21-4.2-4.2m1.2-5.3a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search catalog or ask…"
          aria-label="Search catalog"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSearchSubmit();
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
              e.preventDefault();
              onAskFromSearch();
            }
          }}
        />
        <button type="button" className="rd-v2-search-kbd" onClick={onAskFromSearch} title="Ask">
          ⌘K
        </button>
      </div>
      <div className="rd-v2-header-meta">
        {metaText}
        {usingSeed ? (
          <span className="rd-v2-offline-chip">
            offline
            {onRetry ? (
              <button type="button" className="rd-v2-text-link" onClick={onRetry}>
                retry
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      <button type="button" className="rd-header-avatar" aria-label="Account">
        {headerInitials}
      </button>
    </header>
  );
}
