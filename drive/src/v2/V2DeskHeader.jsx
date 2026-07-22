/** v2 header — stable research shell with contextual account access. */
import { useEffect, useId, useRef, useState } from "react";

function freshnessLabel(refreshedAt) {
  if (refreshedAt == null) return null;
  const sec = Math.max(0, Math.round((Date.now() - refreshedAt) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  return `${min}m ago`;
}

function AccountTrigger({ initials }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  const openDestination = (tab) => {
    setOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    url.searchParams.delete("dataset");
    url.searchParams.delete("preview");
    window.location.assign(url.toString());
  };

  return (
    <div className="rd-v2-account-menu rd-v2-account-menu--header" ref={rootRef} data-testid="header-account-root">
      <button
        type="button"
        className="rd-header-avatar"
        ref={triggerRef}
        aria-label="Account and research context"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid="header-account-menu"
        onClick={() => setOpen((value) => !value)}
      >
        {initials}
      </button>
      {open ? (
        <div id={menuId} className="rd-v2-account-menu-panel rd-v2-account-menu-panel--header" role="menu" aria-label="Account">
          <button type="button" role="menuitem" data-testid="account-menu-profile" onClick={() => openDestination("profile")}>
            <span aria-hidden>◎</span>
            <span><strong>Research context</strong><small>Identity, work, and lab context</small></span>
          </button>
          <button type="button" role="menuitem" data-testid="account-menu-workspace" onClick={() => openDestination("settings")}>
            <span aria-hidden>⚙</span>
            <span><strong>Workspace preferences</strong><small>Desk, access, and connection settings</small></span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

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
  onPendingClick,
  deskStatus = "unknown",
  refreshedAt = null,
  dryRunProtected = true,
  integrationChips = [],
}) {
  const metaText = usingSeed
    ? `${datasetCount} datasets`
    : workCount > 0
      ? `${datasetCount} datasets · ${workCount} pending`
      : `${datasetCount} datasets`;
  const fresh = freshnessLabel(refreshedAt);
  const chips = Array.isArray(integrationChips) ? integrationChips : [];

  return (
    <header className="yzu-header rd-v2-header">
      <button type="button" className="yzu-brand" onClick={onBrandClick}>
        <span className="rd-brand-mark">RD</span>
        <div className="yzu-brand-text"><strong>Research Drive</strong></div>
      </button>
      <div className="rd-search rd-v2-search-pill">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m21 21-4.2-4.2m1.2-5.3a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search data, sources, or ask…"
          aria-label="Search Research Drive"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSearchSubmit();
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
              event.preventDefault();
              onAskFromSearch();
            }
          }}
        />
        <button type="button" className="rd-v2-search-kbd" onClick={onAskFromSearch} title="Ask">⌘K</button>
      </div>
      <div className="rd-v2-header-meta">
        <div className="rd-v2-trust-strip" aria-label="Desk status" data-testid="desk-integration-strip">
          {deskStatus === "ok" ? (
            <span className="rd-v2-trust-badge ok">Live registry</span>
          ) : deskStatus === "empty" ? (
            <span className="rd-v2-trust-badge warn">Empty registry</span>
          ) : usingSeed || deskStatus === "demo" ? (
            <span className="rd-v2-trust-badge warn">Demo catalog</span>
          ) : deskStatus === "degraded" ? (
            <span className="rd-v2-trust-badge warn">Desk degraded</span>
          ) : (
            <span className="rd-v2-trust-badge warn">Desk API offline</span>
          )}
          {chips.map((chip) =>
            chip.id === "desk" && (deskStatus === "degraded" || deskStatus === "ok") ? null : (
              <span key={chip.id} className={`rd-v2-trust-badge ${chip.tone || "muted"}`} title={chip.label}>{chip.label}</span>
            ),
          )}
          {dryRunProtected ? <span className="rd-v2-trust-badge">Dry-run protected</span> : null}
          {fresh ? <span className="rd-v2-trust-badge muted">Updated {fresh}</span> : null}
        </div>
        <span className="rd-v2-header-meta-count">
          {workCount > 0 && onPendingClick ? (
            <>{`${datasetCount} datasets · `}<button type="button" className="rd-v2-header-pending-link" data-testid="header-pending-link" onClick={onPendingClick}>{workCount} pending</button></>
          ) : metaText}
        </span>
        {usingSeed && onRetry ? <button type="button" className="rd-v2-header-retry" onClick={onRetry}>Retry</button> : null}
      </div>
      <AccountTrigger initials={headerInitials} />
    </header>
  );
}
