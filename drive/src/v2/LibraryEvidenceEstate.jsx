import { addedOn } from "@/v2/datasetDates";
import { LockMark } from "@/v2/Lock";
import { useEffect, useMemo, useState } from "react";
import { LIBRARY_FOLDERS_ROOT } from "@/driveTree";
import { displayName, libraryAssetPresentation } from "@/v2/datasetMeta";
import { libraryVerification } from "@/v2/libraryVerification";
import { coverageSpan } from "@/v2/coverageText";
import { StatusPill } from "@/v2/StatusPill";
import { listDescription } from "@/v2/listDescription";
import { sourceSummary } from "@/v2/datasetSources";
import { barBox, filesLabel, glanceTitle, rowsLabel, spanAxis, spanOf, spanText } from "@/v2/libraryGlance";

const PAGE_SIZE = 50;

function sourceLabel(row = {}) {
  return sourceSummary(row);
}

function presentationKind(row = {}) {
  return libraryAssetPresentation(row).kind;
}

function descriptionLabel(row = {}) {
  const explicit = String(
    row.description ||
      row.one_line ||
      row.summary ||
      row.recommended_use ||
      "",
  ).trim();
  if (explicit) return explicit;

  const kind = presentationKind(row);
  const grain = String(row.grain || "").trim();
  const coverage = coverageSpan(row.coverage || row.date_range || row.temporal_coverage).trim();
  const pieces = [];
  if (kind === "scholarly_work") pieces.push("Bibliographic research evidence");
  else if (kind === "metadata_index") pieces.push("Metadata index");
  else if (kind === "live_source") pieces.push("Live research source");
  else if (kind === "operational") pieces.push("Operational research record");
  else pieces.push("Research dataset saved to Library");
  if (grain) pieces.push(`${grain} unit of observation`);
  if (coverage) pieces.push(coverage);
  return pieces.join(" · ");
}

function kindLabel(row = {}) {
  const kind = presentationKind(row);
  if (kind === "scholarly_work") return "Scholarly work";
  if (kind === "metadata_index") return "Metadata index";
  if (kind === "live_source") return "Live source";
  if (kind === "operational") return "Operational";
  return "Dataset";
}

function collectionCountLabel(folder = {}) {
  const count = Number(folder.dataset_count || folder.asset_count || folder.count || 0);
  return Number.isFinite(count) && count > 0 ? String(count) : "";
}

function collectionName(folder = {}) {
  return folder.name || folder.label || folder.id || "Collection";
}

function moveLedgerFocus(event) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const table = event.currentTarget.closest('[role="table"]');
  if (!table) return;
  const rows = [...table.querySelectorAll('[data-testid="library-evidence-row"]')];
  if (!rows.length) return;
  const current = rows.indexOf(event.currentTarget);
  let next = current;
  if (event.key === "ArrowDown") next = Math.min(rows.length - 1, current + 1);
  if (event.key === "ArrowUp") next = Math.max(0, current - 1);
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = rows.length - 1;
  event.preventDefault();
  rows[next]?.focus();
}

function GlanceCell({ row, span, axis }) {
  const box = barBox(span, axis);
  const rows = rowsLabel(span?.rows) || filesLabel(span?.files);
  const kind = kindLabel(row);
  if (kind !== "Dataset" || (!rows && !box)) {
    return <span className="rd-v2-cap-kind" role="cell">{kind}</span>;
  }
  return (
    <span className="rd-v2-cap-kind rd-v2-cap-glance" role="cell" data-testid="library-evidence-glance" title={glanceTitle(span)}>
      {rows ? <b>{rows}</b> : <b className="rd-v2-cap-glance-none">{kind}</b>}
      {box ? (
        <>
          <span className="rd-v2-cap-glance-track" role="img" aria-label={`Covers ${spanText(span)}`}>
            <i style={{ left: `${box.left}%`, width: `${box.width}%` }} />
          </span>
          <em>{spanText(span)}</em>
        </>
      ) : null}
    </span>
  );
}

const MACHINE_ID = /^[a-z0-9]+(?:[_./:-][a-z0-9]+)+$/i;

function matchText(reason, row) {
  const value = String(reason.value ?? "");
  const machine = MACHINE_ID.test(value) && !/\s/.test(value);
  if (reason.kind === "identity" && (machine || value === row.dataset_id)) return <>name · {displayName(row)}</>;
  if (reason.kind === "source" && machine) return <>source · {sourceLabel(row)}</>;
  return <>{reason.label} · {value}</>;
}

export function LibraryEvidenceEstate({
  assets = [],
  collections = [],
  collectionsLoading = false,
  referenceCount = 0,
  onOpenCollection,
  onReviewAvailable,
  onSelectDataset,
  searchQuery = "",
  searchMatchCount = 0,
  onAskCurrentSearch,
  onSearchWider,
  onResetFilters,
  lens = null,
  axisRows = null,
  banner = null,
  access = null,
}) {
  const visibleAssets = assets;
  const showKind = true;
  const spans = useMemo(() => new Map(visibleAssets.map((item) => {
    const row = item?.row || item;
    return [row.dataset_id, spanOf(row)];
  })), [visibleAssets]);
  const showGlance = [...spans.values()].some((span) => span.rows !== null || span.ranged);
  const axis = useMemo(
    () => spanAxis((axisRows || visibleAssets.map((item) => item?.row || item)).map(spanOf)),
    [axisRows, visibleAssets],
  );
  const showVerify = visibleAssets.some((item) => libraryVerification(item?.row || item).key !== "not_checked");
  const ledgerClass = `rd-v2-cap-ledger ${showVerify ? "with-verify" : "without-verify"} show-kind`;
  const query = String(searchQuery || "").trim();
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [collectionsOpen, setCollectionsOpen] = useState(() => (typeof window === "undefined" ? true : window.innerHeight >= 1000));

  // A new search is a new semantic scope, so begin it from the first page.
  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [query]);

  // Live catalogue hydration replaces the backing array. Preserve the user's
  // browsing depth through that refresh and clamp only if the result set shrinks.
  useEffect(() => {
    setVisibleLimit((limit) => {
      if (visibleAssets.length <= PAGE_SIZE) return PAGE_SIZE;
      return Math.min(Math.max(limit, PAGE_SIZE), visibleAssets.length);
    });
  }, [visibleAssets.length]);

  const pagedAssets = useMemo(
    () => visibleAssets.slice(0, visibleLimit),
    [visibleAssets, visibleLimit],
  );
  const hasMore = pagedAssets.length < visibleAssets.length;
  const filteredSearchMiss = Boolean(query && searchMatchCount > 0 && !visibleAssets.length);
  const trueSearchMiss = Boolean(query && searchMatchCount === 0);

  return (
    <section className="rd-v2-cap-estate" data-testid="library-evidence-estate" aria-label="Research evidence estate">
      {collections.length || collectionsLoading ? (
        <div className="rd-v2-cap-collections" role="group" aria-label="Research collections and folder storage">
          <span className="rd-v2-cap-collections-label">
            Research collections
            {collections.length > 6 ? (
              <button
                type="button"
                className="rd-v2-cap-collections-toggle"
                data-testid="library-collections-toggle"
                aria-expanded={collectionsOpen}
                onClick={() => setCollectionsOpen((open) => !open)}
              >
                {collectionsOpen ? "Show fewer" : `Show all ${collections.length}`}
              </button>
            ) : null}
          </span>
          {collections.length ? (
            <div className={`rd-v2-cap-collection-list${collectionsOpen ? "" : " is-single-row"}`}>
              {collections.map((collection) => {
                const name = collectionName(collection);
                return (
                  <button
                    key={collection.id}
                    type="button"
                    className="rd-v2-cap-collection"
                    data-testid="library-collection-filter"
                    aria-label={`Open ${name} directory`}
                    title={`Open ${name} in Folders`}
                    onClick={() => onOpenCollection?.(collection)}
                  >
                    <span>{name}</span>
                    {collectionCountLabel(collection) ? <b>{collectionCountLabel(collection)}</b> : null}
                  </button>
                );
              })}
              <button
                type="button"
                className="rd-v2-cap-collection rd-v2-cap-folders-root"
                data-testid="library-folders-root"
                aria-label="Browse storage folders"
                title="Browse the Library storage structure"
                onClick={() => onOpenCollection?.({ id: LIBRARY_FOLDERS_ROOT, name: "Folders" })}
              >
                <span>Browse folders</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          ) : (
            <span className="rd-v2-cap-collections-loading" role="status" data-testid="library-collections-loading">
              Organizing collections…
            </span>
          )}
        </div>
      ) : null}

      {banner}

      {lens || access ? (
        <div className="rd-v2-cap-lens" data-testid="library-lens">
          {lens ? (
          <div className="rd-v2-cap-lens-options" role="group" aria-label="Choose which datasets to list">
            {lens.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="rd-v2-cap-lens-option"
                aria-pressed={lens.active === option.id}
                data-testid={`library-lens-${option.id}`}
                onClick={() => lens.onChange(option.id)}
              >
                <span>{option.label}</span>
                <b>{option.count}</b>
              </button>
            ))}
          </div>
          ) : null}
          {access ? (
            <div className="rd-v2-cap-access" role="group" aria-label="Filter by access" data-testid="library-access-filter">
              {access.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`rd-v2-cap-access-option is-${option.id}`}
                  aria-pressed={access.active === option.id}
                  onClick={() => access.onChange(access.active === option.id ? "all" : option.id)}
                >
                  {option.id === "members" ? <LockMark className="rd-v2-lock-mark" /> : <span className="rd-v2-status-dot" aria-hidden="true" />}
                  <span>{option.label}</span>
                  <b>{option.count}</b>
                </button>
              ))}
            </div>
          ) : null}
          {lens?.note ? <p className="rd-v2-cap-lens-note" data-testid="library-lens-note">{lens.note}</p> : null}
        </div>
      ) : null}

      <div className={ledgerClass} role="table" aria-label="Library evidence">
        <div className="rd-v2-cap-ledger-head" role="row">
          <span role="columnheader">Dataset</span>
          {showKind ? <span role="columnheader">{showGlance ? "Coverage" : "Type"}</span> : null}
          <span role="columnheader">Source</span>
          {showVerify ? <span role="columnheader" title="Whether the recorded source evidence has been checked">Verify</span> : null}
          <span role="columnheader" title="Whether this evidence can be used directly for research or querying">Readiness</span>
        </div>
        <div className="rd-v2-cap-ledger-body" key={lens?.active || "rows"}>
          {visibleAssets.length ? (
            pagedAssets.map((item) => {
              const row = item?.row || item;
              const verification = libraryVerification(row);
              return (
                <div
                  key={row.dataset_id || item.id}
                  className="rd-v2-cap-ledger-row"
                  data-testid="library-evidence-row"
                  data-kind="evidence"
                  role="row"
                  tabIndex={0}
                  aria-keyshortcuts="ArrowUp ArrowDown Home End Enter"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      if (event.target !== event.currentTarget) return;
                      event.preventDefault();
                      onSelectDataset?.(row);
                      return;
                    }
                    moveLedgerFocus(event);
                  }}
                  onClick={() => onSelectDataset?.(row)}
                >
                  <span className="rd-v2-cap-evidence" role="cell">
                    <strong title={displayName(row)}>{displayName(row)}</strong>
                    <em>{listDescription(descriptionLabel(row))}</em>
                    {query && row.search_match?.reasons?.length ? (
                      <span className="rd-v2-library-match" data-testid="library-search-match">
                        <b>Matched</b>
                        {row.search_match.reasons.slice(0, 2).map((reason) => (
                          <span key={`${reason.kind}-${reason.value}`}>
                            {matchText(reason, row)}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  {showKind ? <GlanceCell row={row} span={spans.get(row.dataset_id)} axis={axis} /> : null}
                  <span className="rd-v2-cap-source" role="cell">
                    <span className="rd-v2-cap-source-name" title={sourceLabel(row)}>{sourceLabel(row)}</span>
                    {addedOn(row) ? <em className="rd-v2-cap-added">{addedOn(row)}</em> : null}
                  </span>
                  {showVerify ? (
                    <span
                      className={`rd-v2-cap-verify ${verification.kind}`}
                      data-testid="library-evidence-verification"
                      role="cell"
                    >
                      {verification.label}
                    </span>
                  ) : null}
                  <span className="rd-v2-cap-state" data-testid="library-evidence-readiness" role="cell">
                    <StatusPill dataset={row} />
                  </span>
                </div>
              );
            })
          ) : (
            <div className="rd-v2-cap-ledger-empty" data-testid="library-evidence-empty">
              <strong>
                {trueSearchMiss
                  ? `No data in your Library matches “${query}”.`
                  : filteredSearchMiss
                    ? "Matching evidence is hidden by the current filters."
                    : "No evidence matches the current Library filters."}
              </strong>
              <p>
                {trueSearchMiss
                  ? "Library searched data you have. Ask can interpret the need, or Discover can search beyond your Library."
                  : "Reset the filters to return to all data in your Library."}
              </p>
              <div className="rd-v2-library-empty-actions">
                {trueSearchMiss && onAskCurrentSearch ? (
                  <button type="button" className="rd-v2-btn sm" onClick={onAskCurrentSearch}>
                    Ask Library
                  </button>
                ) : null}
                {trueSearchMiss && onSearchWider ? (
                  <button type="button" className="rd-v2-btn sm" onClick={() => onSearchWider(query)}>
                    Search wider in Discover
                  </button>
                ) : null}
                {!trueSearchMiss && onResetFilters ? (
                  <button type="button" className="rd-v2-btn sm" onClick={onResetFilters}>
                    Clear filters
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {visibleAssets.length > PAGE_SIZE ? (
        <div className="rd-v2-library-pagination" role="group" aria-label="Library evidence pagination">
          <span>Showing {pagedAssets.length} of {visibleAssets.length} datasets</span>
          {hasMore ? (
            <button type="button" className="rd-v2-btn sm" onClick={() => setVisibleLimit((limit) => limit + PAGE_SIZE)}>
              Load {Math.min(PAGE_SIZE, visibleAssets.length - pagedAssets.length)} more
            </button>
          ) : (
            <button type="button" className="rd-v2-btn sm ghost" onClick={() => setVisibleLimit(PAGE_SIZE)}>
              Back to first {PAGE_SIZE}
            </button>
          )}
        </div>
      ) : null}

      {referenceCount > 0 ? (
        <section className="rd-v2-library-available compact" aria-label="Available evidence outside your Library" data-testid="library-available-evidence">
          <p>
            <strong>
              {referenceCount} known record{referenceCount === 1 ? "" : "s"} {referenceCount === 1 ? "sits" : "sit"} outside your Library.
            </strong>{" "}
            They remain Discover evidence until explicitly added.
          </p>
          {onReviewAvailable ? (
            <button type="button" className="rd-v2-btn sm" onClick={onReviewAvailable}>
              Review in Discover
            </button>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
