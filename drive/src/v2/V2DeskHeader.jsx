/** Research Drive header — product value first, implementation detail subordinate. */
import { useEffect, useId, useRef, useState } from "react";

function freshnessLabel(refreshedAt) {
  if (refreshedAt == null) return null;
  const sec = Math.max(0, Math.round((Date.now() - refreshedAt) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  return `${min}m ago`;
}

function facultyChip(chip) {
  const label = String(chip?.label || "").trim();
  const normalized = label.toLowerCase();
  if (!label) return null;
  if (/\btools?\b|\bmcp\b/.test(normalized)) return null;
  if (/transcend|bulk cache|storage/.test(normalized)) return { ...chip, label: "Evidence storage online" };
  if (/composer|assistant|model/.test(normalized)) return { ...chip, label: "Composer available" };
  if (/worker|cluster|compute/.test(normalized)) return { ...chip, label: "Acquisition capacity available" };
  if (/registry/.test(normalized)) return { ...chip, label: "Research estate indexed" };
  return chip;
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
          <a href="/?tab=profile" role="menuitem" data-testid="account-menu-profile" onClick={() => setOpen(false)}>
            <span aria-hidden>◎</span>
            <span><strong>Research context</strong><small>Identity, work, and institutional research estate</small></span>
          </a>
          <a href="/?tab=settings" role="menuitem" data-testid="account-menu-workspace" onClick={() => setOpen(false)}>
            <span aria-hidden>⚙</span>
            <span><strong>Workspace preferences</strong><small>Desk access, evidence routes, and connection settings</small></span>
          </a>
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
  const assetLabel = `${datasetCount} evidence asset${datasetCount === 1 ? "" : "s"}`;
  const decisionLabel = `${workCount} decision${workCount === 1 ? "" : "s"} waiting`;
  const metaText = workCount > 0 ? `${assetLabel} · ${decisionLabel}` : assetLabel;
  const fresh = freshnessLabel(refreshedAt);
  const chips = (Array.isArray(integrationChips) ? integrationChips : [])
    .filter((chip) => !(chip.id === "desk" && (deskStatus === "degraded" || deskStatus === "ok")))
    .map(facultyChip)
    .filter(Boolean)
    .filter((chip, index, rows) => rows.findIndex((row) => row.label === chip.label) === index)
    .slice(0, 2);

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
          placeholder="Search evidence or ask Research Drive…"
          aria-label="Search evidence or ask Research Drive"
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
        <button type="button" className="rd-v2-search-kbd" onClick={onAskFromSearch} title="Ask Research Drive">⌘K</button>
      </div>
      <div className="rd-v2-header-meta">
        <div className="rd-v2-trust-strip" aria-label="Research desk status" data-testid="desk-integration-strip">
          {deskStatus === "ok" ? (
            <span className="rd-v2-trust-badge ok">Research estate live</span>
          ) : deskStatus === "empty" ? (
            <span className="rd-v2-trust-badge warn">Research estate empty</span>
          ) : usingSeed || deskStatus === "demo" ? (
            <span className="rd-v2-trust-badge warn">Demonstration evidence</span>
          ) : deskStatus === "degraded" ? (
            <span className="rd-v2-trust-badge warn">Research desk degraded</span>
          ) : (
            <span className="rd-v2-trust-badge warn">Research desk offline</span>
          )}
          {chips.map((chip) => (
            <span key={chip.id || chip.label} className={`rd-v2-trust-badge ${chip.tone || "muted"}`} title={chip.label}>{chip.label}</span>
          ))}
          {dryRunProtected ? <span className="rd-v2-trust-badge">Protected execution</span> : null}
          {fresh ? <span className="rd-v2-trust-badge muted">Updated {fresh}</span> : null}
        </div>
        <span className="rd-v2-header-meta-count">
          {workCount > 0 && onPendingClick ? (
            <>{`${assetLabel} · `}<button type="button" className="rd-v2-header-pending-link" data-testid="header-pending-link" onClick={onPendingClick}>{decisionLabel}</button></>
          ) : metaText}
        </span>
        {usingSeed && onRetry ? <button type="button" className="rd-v2-header-retry" onClick={onRetry}>Reconnect</button> : null}
      </div>
      <AccountTrigger initials={headerInitials} />
    </header>
  );
}
