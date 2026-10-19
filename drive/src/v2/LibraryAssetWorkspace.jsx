import { AnalysisResults } from "./AnalysisResults.jsx";
import { plainRoute } from "./plainText.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { plainIdentifiers } from "@/v2/plainText";
import { queryDataset } from "@/v2/api";
import { columnBarFilter, columnBars, columnSummary, columnSummaryTitle, profileBasis, sampleReceipt } from "@/v2/columnSummary";
import {
  detailFields,
  displayName,
  libraryAssetPresentation,
  statusPillKind,
} from "@/v2/datasetMeta";
import { librarySourceReceipt } from "@/v2/libraryProvenance";
import { libraryVerification } from "@/v2/libraryVerification";
import { LibraryHoldingsOverlay } from "@/v2/LibraryHoldingsOverlay";
import { summarizeLibraryHoldings } from "@/v2/libraryHoldings";
import { PageShell } from "@/v2/ui";
import { previewCellValue } from "@/v2/previewValue";
import { collectionRecipe } from "./collectionRecipe.js";
import { coverageText } from "./coverageText.js";
import { glanceCoverage } from "./libraryGlance.js";
import { listedSources, sourcesHeading } from "./datasetSources.js";
import { LibraryPackagePanel } from "./LibraryPackagePanel.jsx";
import { datasetDownloadHref } from "@/v2/askDownloadLink";
import { requestDeskSignIn, useDeskPermission } from "@/v2/deskPermissions";
import { licensedRowsLocked } from "@/v2/licensedAccess";
import { LicensedBrief } from "./LicensedBrief.jsx";
import { datasetCitation } from "./datasetCitation.js";

function value(...candidates) {
  return candidates.map((item) => String(item || "").trim()).find(Boolean) || "Not documented";
}

function fieldNames(dataset, fields) {
  const declared = Array.isArray(dataset?.fields)
    ? dataset.fields
    : Array.isArray(dataset?.columns)
      ? dataset.columns.map((item) => (typeof item === "string" ? item : item?.name))
      : [];
  return [...new Set([...(fields.joinKeys || []), ...declared].filter(Boolean))].slice(0, 16);
}

function recordTerms(dataset) {
  return [...new Set([
    ...(Array.isArray(dataset?.tags) ? dataset.tags : []),
    ...(Array.isArray(dataset?.keywords) ? dataset.keywords : []),
  ].map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 10);
}

function limitation(dataset, fields, presentation) {
  const explicit = [dataset?.limitations, dataset?.caveats, fields.limitations]
    .map((item) => String(item || "").trim())
    .find(Boolean);
  if (explicit) return explicit;

  if (presentation.kind === "scholarly_work") {
    return "Saving to Library confirms the work is retained. It does not confirm its source or suitability for your method.";
  }

  const state = statusPillKind(dataset).kind;
  if (state === "connected") {
    return "A live source connection does not confirm immediate local query access or a built local copy.";
  }
  if (state === "remote") {
    return "Available metadata does not confirm a local dataset ready to query.";
  }
  if (state === "registered") {
    return "Saving to Library does not confirm local query access.";
  }
  if (state === "queued") {
    return "Queued acquisition does not establish that the requested evidence has been obtained.";
  }
  if (state === "failed") {
    return "The data cannot be treated as usable evidence until the failure is resolved.";
  }
  if (state === "warn") {
    return "The readiness warning must be resolved before this data can be used for analysis.";
  }
  if (state === "unknown") {
    return "Current metadata does not establish a usable query path or complete evidence boundary.";
  }
  if (state === "query-ready") {
    return "Query readiness establishes access, not field completeness or fitness for every research design.";
  }
  return "The current Library record does not establish all the limits on using this data for research.";
}

function ReceiptFact({ label, value: factValue, href = "", mono = false, testId = undefined }) {
  if (!factValue) return null;
  return (
    <div data-testid={testId}>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>
        {href ? <a href={href} target="_blank" rel="noreferrer">{factValue}</a> : factValue}
      </dd>
    </div>
  );
}

function CitationBlock({ label, text: citation, testId }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="rd-v2-library-citation" data-testid={testId}>
      <header>
        <span>{label}</span>
        <button type="button" className="rd-v2-btn sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </header>
      <pre tabIndex={0}>{citation}</pre>
    </div>
  );
}

function AssetOverlay({ kind, dataset, fields, presentation, onClose }) {
  const closeButtonRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!kind) return undefined;
    restoreFocusRef.current = document.activeElement;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current?.();
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleEscape, true);
      const previousFocus = restoreFocusRef.current;
      window.requestAnimationFrame(() => {
        if (previousFocus?.isConnected) previousFocus.focus?.();
      });
    };
  }, [kind]);

  if (!kind) return null;
  const scholarly = presentation.kind === "scholarly_work";
  const liveSource = presentation.kind === "live_source";
  const title = kind === "fields" ? presentation.structureTitle : kind === "cite" ? "Cite this dataset" : "Source and provenance";
  const names = fieldNames(dataset, fields);
  const terms = recordTerms(dataset);
  const verification = libraryVerification(dataset);
  const readiness = statusPillKind(dataset);
  const receipt = librarySourceReceipt(dataset);
  return (
    <div className="rd-v2-library-overlay-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="rd-v2-library-overlay" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <span className="rd-v2-eyebrow">Library inspection</span>
            <h2>{title}</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="rd-v2-btn sm" onClick={onClose} aria-label="Close inspection">Close</button>
        </header>
        {kind === "cite" ? (
          <CiteContent dataset={dataset} />
        ) : kind === "fields" ? (
          scholarly ? (
            <>
              <p>
                Bibliographic and access metadata for {displayName(dataset)}. This describes the research object; it does not pretend a paper has tabular fields or join keys.
              </p>
              <dl className="rd-v2-library-overlay-facts">
                <div><dt>Object type</dt><dd>Scholarly work</dd></div>
                <div><dt>Identifier</dt><dd className="is-identifier" title={value(dataset?.doi, dataset?.url, dataset?.dataset_id)}>{value(dataset?.doi, dataset?.url, dataset?.dataset_id)}</dd></div>
                <div><dt>Source</dt><dd>{value(fields.source, dataset?.source_system, dataset?.publisher)}</dd></div>
                <div><dt>Access record</dt><dd>{value(dataset?.access_mode, dataset?.access_shape, dataset?.backend)}</dd></div>
              </dl>
              {terms.length ? (
                <div className="rd-v2-library-field-list" role="group" aria-label="Research terms">
                  {terms.map((name) => <code key={name}>{name}</code>)}
                </div>
              ) : null}
            </>
          ) : liveSource ? (
            <>
              <p>Documented response fields for {displayName(dataset)}. These describe the connected source contract; they are not an observed local row sample.</p>
              {names.length ? (
                <div className="rd-v2-library-field-list">
                  {names.map((name) => <code key={name}>{name}</code>)}
                </div>
              ) : (
                <p className="rd-v2-library-muted">No response fields are documented in the current Library record.</p>
              )}
              <dl className="rd-v2-library-overlay-facts">
                <div><dt>Access</dt><dd>{plainRoute(value(dataset?.collect_via, dataset?.backend, fields.access))}</dd></div>
                <div><dt>Coverage</dt><dd>{value(fields.coverage, dataset?.coverage)}</dd></div>
              </dl>
            </>
          ) : (
            <>
              <p>Documented fields and operations for {displayName(dataset)}. They are registry metadata until a local preview is observed.</p>
              {names.length ? (
                <div className="rd-v2-library-field-list">
                  {names.map((name) => <code key={name}>{name}</code>)}
                </div>
              ) : (
                <p className="rd-v2-library-muted">No fields are documented in the current Library record.</p>
              )}
              <dl className="rd-v2-library-overlay-facts">
                <div><dt>Unit of observation</dt><dd>{value(dataset?.grain)}</dd></div>
                <div><dt>Coverage</dt><dd>{value(fields.coverage, dataset?.coverage)}</dd></div>
                <div><dt>Join keys</dt><dd>{names.filter((name) => (fields.joinKeys || []).includes(name)).join(" · ") || "Not documented"}</dd></div>
              </dl>
            </>
          )
        ) : (
          <>
            <p>
              Source history and reproduction record for this Library dataset. Source verification, collection method, and readiness for use are checked separately from where copies are stored.
            </p>
            <dl className="rd-v2-library-overlay-facts" data-testid="library-provenance-receipt">
              <div><dt>Source verification</dt><dd>{value(fields.source, dataset?.source, dataset?.publisher)}</dd></div>
              <ReceiptFact
                label={receipt.sourceUrlKind || "Exact source URL"}
                value={receipt.sourceUrl || "Not recorded"}
                href={receipt.sourceUrl}
                mono
                testId="library-source-url"
              />
              <ReceiptFact label="Acquisition method" value={receipt.method || "Not recorded"} testId="library-source-method" />
              <ReceiptFact label="Reproduce command" value={receipt.command} mono testId="library-source-command" />
              <ReceiptFact label="Script" value={receipt.script} mono testId="library-source-script" />
              <ReceiptFact label="How it’s collected" value={receipt.route} mono testId="library-source-route" />
              <ReceiptFact label="Upstream datasets" value={receipt.upstream} mono />
              <div data-testid="library-source-verification"><dt>Verification</dt><dd>{verification.label}</dd></div>
              <div data-testid="library-source-readiness"><dt>Use readiness</dt><dd>{readiness.label}</dd></div>
              {!scholarly ? <div><dt>Coverage</dt><dd>{value(fields.coverage, dataset?.coverage)}</dd></div> : null}
            </dl>
            <p className="rd-v2-library-verification-note">{verification.body}</p>
            {!receipt.sourceUrl || !(receipt.command || receipt.script || receipt.route || receipt.method) ? (
              <p className="rd-v2-library-verification-note">
                Reproduction is incomplete because the registry does not yet retain {[
                  !receipt.sourceUrl ? "an exact source URL" : "",
                  !(receipt.command || receipt.script || receipt.route || receipt.method) ? "a collection method or runnable route" : "",
                ].filter(Boolean).join(" and ")} for this data.
              </p>
            ) : null}
            <details className="rd-v2-library-tech-disclosure">
              <summary>Technical details</summary>
              <dl className="rd-v2-library-overlay-facts compact">
                <div><dt>Library ID</dt><dd><code>{dataset?.dataset_id || "Not declared"}</code></dd></div>
                <ReceiptFact label="Source endpoint" value={receipt.sourceEndpoint} mono />
                <ReceiptFact label="Fetched at" value={receipt.fetchedAt} />
                <ReceiptFact label="Content SHA-256" value={receipt.contentSha256} mono />
              </dl>
            </details>
          </>
        )}
      </section>
    </div>
  );
}

function CiteContent({ dataset }) {
  const citation = datasetCitation(dataset);
  const gaps = [
    citation.hasDate ? "" : "a retrieval date",
    citation.hasUrl ? "" : "a citable source URL",
  ].filter(Boolean);
  return (
    <>
      <p>For a methods section or reference list. Check the publisher’s own citation guidance where it has one.</p>
      <CitationBlock label="APA 7" text={citation.apa} testId="library-citation-apa" />
      <CitationBlock label="BibTeX" text={citation.bib} testId="library-citation-bibtex" />
      {gaps.length ? (
        <p className="rd-v2-library-verification-note">The Library record has no {gaps.join(" or ")} for this data, so the citation leaves it out.</p>
      ) : null}
    </>
  );
}

function observedColumns(rows = []) {
  const ordered = [];
  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      if (!ordered.includes(key)) ordered.push(key);
      if (ordered.length >= 12) return ordered;
    }
  }
  return ordered;
}

const RANGE = /(\d{4}(?:-\d{2}){0,2}\s*[–-]\s*\d{4}(?:-\d{2}){0,2}|\d{4}-\d{2}(?:-\d{2})?)/g;

function keepRangesTogether(title) {
  const text = String(title || "");
  const parts = text.split(RANGE);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (index % 2 ? <span key={index} className="rd-v2-nowrap">{part}</span> : part));
}

function filterCount(matched, read, profile) {
  const total = Number(profile?.rows_total) || read;
  const of = total > read ? `the first ${read.toLocaleString("en-US")}` : read.toLocaleString("en-US");
  return `${matched.toLocaleString("en-US")} of ${of} rows${matched > 8 ? " · first 8 shown" : ""}`;
}

function moveBarFocus(event) {
  const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (!step) return;
  const buttons = [...event.currentTarget.querySelectorAll("button")];
  const next = buttons[buttons.indexOf(document.activeElement) + step];
  if (next) {
    event.preventDefault();
    next.focus();
  }
}

const datasetAnalysis = (dataset) => dataset?.analysis || dataset?.synthesis_analysis || null;

function DatasetPreview({ dataset, canQuery, names, fields, state, presentation, onInspect, onExpandSample }) {
  const analysis = datasetAnalysis(dataset);
  const [loadedPreview, setPreview] = useState(null);
  const preview = loadedPreview?.datasetId === dataset?.dataset_id ? loadedPreview
    : { loading: Boolean(canQuery && dataset?.dataset_id), rows: [], error: "" };

  useEffect(() => {
    let cancelled = false;
    if (!canQuery || !dataset?.dataset_id) {
      setPreview({ datasetId: dataset?.dataset_id, loading: false, rows: [], error: "" });
      return undefined;
    }
    setPreview({ datasetId: dataset.dataset_id, loading: true, rows: [], error: "" });
    queryDataset(dataset.dataset_id, analysis ? 10000 : 8, { spread: !analysis, profile: !analysis })
      .then((payload) => {
        if (!cancelled) {
          setPreview({
            datasetId: dataset.dataset_id,
            loading: false,
            rows: Array.isArray(payload?.rows) ? (analysis ? payload.rows : payload.rows.slice(0, 8)) : [],
            profile: payload?.profile && Array.isArray(payload.profile.columns) ? payload.profile : null,
            total: Number(payload?.meta?.rows_total_after_filter) || 0,
            error: "",
          });
        }
      })
      .catch(() => {
        if (!cancelled) setPreview({ datasetId: dataset.dataset_id, loading: false, rows: [], error: "Preview is not available right now." });
      });
    return () => { cancelled = true; };
  }, [canQuery, dataset?.dataset_id, analysis]);

  const [barPick, setBarPick] = useState(null);
  const [profiledRows, setProfiledRows] = useState(null);
  const pick = barPick?.datasetId === dataset?.dataset_id ? barPick : null;
  const pool = profiledRows?.datasetId === dataset?.dataset_id ? profiledRows : null;

  const loadPool = (datasetId) => {
    setProfiledRows({ datasetId, loading: true, rows: [], error: "" });
    const settle = (next) => setProfiledRows((current) => (current?.datasetId === datasetId ? next : current));
    queryDataset(datasetId, 2000)
      .then((payload) => settle({ datasetId, loading: false, rows: Array.isArray(payload?.rows) ? payload.rows : [], error: "" }))
      .catch(() => settle({ datasetId, loading: false, rows: [], error: "These rows could not be read right now." }));
  };

  if (analysis) return <AnalysisResults analysis={analysis} chart={dataset.chart} rows={preview.datasetId === dataset.dataset_id ? preview.rows : []} />;

  const columns = observedColumns(preview.rows);
  const schemaColumns = columns.length ? columns : names.slice(0, 12);
  const observed = columns.length > 0 && preview.rows.length > 0;
  const profileByName = new Map((preview.profile?.columns || []).map((column) => [column.name, column]));
  const activeFilter = pick ? columnBarFilter(profileByName.get(pick.column), pick.index) : null;
  const filtering = Boolean(activeFilter) && observed;
  const matchedRows = filtering && pool && !pool.loading ? pool.rows.filter((row) => activeFilter.matches(row?.[pick.column])) : [];
  const shownRows = filtering ? matchedRows.slice(0, 8) : preview.rows;
  const choose = (column, index) => {
    if (!pool || pool.error) loadPool(dataset.dataset_id);
    setBarPick((current) => (
      current?.datasetId === dataset?.dataset_id && current.column === column && current.index === index
        ? null
        : { datasetId: dataset?.dataset_id, column, index }
    ));
  };
  const joinKeys = fields.joinKeys || [];
  const rowCount = dataset?.rows || dataset?.row_count || dataset?.num_rows || dataset?.records || dataset?.glance?.rows;
  const liveSource = presentation.kind === "live_source";
  if (licensedRowsLocked(dataset)) {
    return (
      <section className="rd-v2-library-data-preview" aria-label="What this dataset holds" data-testid="library-data-preview">
        <div className="rd-v2-library-section-heading">
          <div>
            <span className="rd-v2-eyebrow">Dataset inspection</span>
            <h2>What this dataset holds</h2>
          </div>
          <div className="rd-v2-library-preview-tools">
            <button type="button" className="rd-v2-btn sm" onClick={onInspect}>Inspect schema</button>
          </div>
        </div>
        <LicensedBrief dataset={dataset} columns={names} />
      </section>
    );
  }
  const coverage = coverageText(fields.coverage || dataset?.coverage).trim() || glanceCoverage(dataset);
  const grain = String(dataset?.grain || "").trim();

  return (
    <section className="rd-v2-library-data-preview" aria-label="Dataset table and structure" data-testid="library-data-preview">
      <div className="rd-v2-library-section-heading">
        <div>
          <span className="rd-v2-eyebrow">{liveSource ? "Source inspection" : "Dataset inspection"}</span>
          <h2>{observed ? (liveSource ? "Observed response sample" : "Observed sample") : (liveSource ? "Documented response shape" : "Table structure")}</h2>
        </div>
        <div className="rd-v2-library-preview-tools">
          {observed ? (
            <span className="rd-v2-library-observation-receipt" data-testid="library-observation-receipt">
              {sampleReceipt(preview.rows.length, columns.length, preview.profile?.rows_total || preview.total)}
            </span>
          ) : null}
          <button type="button" className="rd-v2-btn sm" onClick={onInspect}>Inspect schema</button>
          {canQuery && onExpandSample ? (
            <button type="button" className="rd-v2-btn sm" onClick={onExpandSample}>Expand sample</button>
          ) : null}
        </div>
      </div>

      {preview.loading ? <p className="rd-v2-library-muted">Reading a local sample…</p> : null}
      {!preview.loading && preview.error ? <p className="rd-v2-library-muted">{preview.error}</p> : null}
      {!preview.loading && !preview.error && canQuery && !preview.rows.length ? (
        <p className="rd-v2-library-muted">The current query path returned no sample rows.</p>
      ) : null}

      {filtering ? (
        <div className="rd-v2-library-bar-filter" data-testid="library-bar-filter" role="status">
          <span>
            Rows where <strong>{pick.column}</strong> is <strong>{activeFilter.label}</strong>
            {pool && !pool.loading && !pool.error ? ` · ${filterCount(matchedRows.length, pool.rows.length, preview.profile)}` : ""}
          </span>
          <button type="button" className="rd-v2-btn sm" onClick={() => setBarPick(null)}>Show the sample</button>
        </div>
      ) : null}

      {schemaColumns.length ? (
        <div className="rd-v2-library-glimpse-table-wrap">
          <table className="rd-v2-library-glimpse-table">
            <thead>
              <tr>{schemaColumns.map((column) => <th key={column}>{column}</th>)}</tr>
              {observed && profileByName.size ? (
                <tr className="rd-v2-library-column-profile" data-testid="library-column-profile">
                  {schemaColumns.map((column) => (
                    <td key={column} title={columnSummaryTitle(profileByName.get(column))}>
                      {columnBars(profileByName.get(column)).length ? (
                        <span
                          className={`rd-v2-library-column-bars${pick?.column === column ? " has-pick" : ""}`}
                          role="group"
                          aria-label={`${column} distribution`}
                          onKeyDown={moveBarFocus}
                        >
                          {columnBars(profileByName.get(column)).map((height, index) => {
                            const bar = columnBarFilter(profileByName.get(column), index);
                            const picked = pick?.column === column && pick.index === index;
                            const label = bar ? `${bar.label} · ${bar.count.toLocaleString("en-US")} row${bar.count === 1 ? "" : "s"}` : "";
                            return (
                              <button
                                key={index}
                                type="button"
                                className={picked ? "is-picked" : undefined}
                                tabIndex={(pick?.column === column ? picked : index === 0) ? 0 : -1}
                                aria-pressed={picked}
                                aria-label={`Show rows where ${column} is ${label}`}
                                title={label}
                                disabled={!bar}
                                onClick={() => choose(column, index)}
                              >
                                <i style={{ height: `${Math.max(6, Math.round(height * 100))}%` }} />
                              </button>
                            );
                          })}
                        </span>
                      ) : null}
                      {columnSummary(profileByName.get(column))}
                    </td>
                  ))}
                </tr>
              ) : null}
            </thead>
            <tbody>
              {filtering && (!pool || pool.loading || pool.error || !matchedRows.length) ? (
                <tr className="rd-v2-library-schema-only-row">
                  <td colSpan={Math.max(schemaColumns.length, 1)}>
                    {!pool || pool.loading ? "Reading the matching rows…" : pool.error || "None of the summarised rows fall in this bar."}
                  </td>
                </tr>
              ) : observed ? (
                shownRows.map((row, index) => (
                  <tr key={index}>
                    {schemaColumns.map((column) => <td key={column}>{previewCellValue(row[column])}</td>)}
                  </tr>
                ))
              ) : (
                <tr className="rd-v2-library-schema-only-row">
                  <td colSpan={Math.max(schemaColumns.length, 1)}>
                    {preview.loading ? "Reading a local sample…" : canQuery
                      ? "Observed rows are not available in this sample."
                      : liveSource
                        ? `${state.label} does not confirm an observed response sample. The fields above show only documented structure.`
                        : `${state.label} does not confirm an observed row preview. The columns above show only documented structure.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rd-v2-library-preview-empty">
          <strong>{liveSource ? "No response structure is available yet." : "No table structure is available yet."}</strong>
          <span>{state.label} does not currently expose {liveSource ? "documented response fields" : "observed columns or a documented field list"}.</span>
        </div>
      )}

      <div className="rd-v2-library-preview-foot">
        <span>{observed ? (profileBasis(preview.profile) || "Values read from the stored data") : "Documented structure only"}</span>
        {coverage ? <span>Coverage: {coverage}</span> : !liveSource ? <span>Coverage: Not documented</span> : null}
        {liveSource ? null : <span>Unit of observation: {grain || "Not documented"}</span>}
        {liveSource ? null : <span>Scale: {rowCount ? `${Number.isFinite(Number(rowCount)) ? Number(rowCount).toLocaleString("en-US") : rowCount} rows` : "Not documented"}</span>}
        {liveSource ? (joinKeys.length ? <span>Keys: {joinKeys.join(" · ")}</span> : null) : <span>Keys: {joinKeys.length ? joinKeys.join(" · ") : "Not documented"}</span>}
      </div>
    </section>
  );
}

function EvidenceShape({ dataset, fields, presentation, rowCount, state }) {
  if (presentation.kind === "scholarly_work") {
    return (
      <dl className="rd-v2-library-evidence-facts">
        <div><dt>Object type</dt><dd>Scholarly work</dd></div>
        <div><dt>Identifier</dt><dd className="is-identifier" title={value(dataset?.doi, dataset?.url, dataset?.dataset_id)}>{value(dataset?.doi, dataset?.url, dataset?.dataset_id)}</dd></div>
        <div><dt>Source</dt><dd>{value(fields.source, dataset?.source_system, dataset?.publisher)}</dd></div>
        <div><dt>Access</dt><dd>{plainIdentifiers(value(dataset?.access_mode, dataset?.access_shape, dataset?.backend))}</dd></div>
        <div><dt>Library state</dt><dd>{state.label}</dd></div>
      </dl>
    );
  }
  if (presentation.kind === "live_source") {
    return (
      <dl className="rd-v2-library-evidence-facts">
        <div><dt>Object type</dt><dd>{state.kind === "connected" ? "Connected source" : "Live source"}</dd></div>
        <div><dt>Source</dt><dd>{value(fields.source, dataset?.source_system)}</dd></div>
        <div><dt>Access</dt><dd>{plainRoute(value(dataset?.collect_via, dataset?.backend, fields.access))}</dd></div>
        <div><dt>Coverage</dt><dd>{value(fields.coverage, dataset?.coverage)}</dd></div>
        <div><dt>Use state</dt><dd>{state.label}</dd></div>
      </dl>
    );
  }
  if (presentation.kind === "operational") {
    return (
      <dl className="rd-v2-library-evidence-facts">
        <div><dt>Object type</dt><dd>Operational resource</dd></div>
        <div><dt>Source</dt><dd>{value(fields.source, dataset?.source_system)}</dd></div>
        <div><dt>Access</dt><dd>{plainIdentifiers(value(dataset?.access_mode, dataset?.backend, fields.access))}</dd></div>
        <div><dt>State</dt><dd>{state.label}</dd></div>
        <div><dt>Coverage</dt><dd>{value(fields.coverage, dataset?.coverage)}</dd></div>
      </dl>
    );
  }
  return (
    <dl className="rd-v2-library-evidence-facts">
      <div><dt>Unit of observation</dt><dd>{value(dataset?.grain)}</dd></div>
      <div><dt>Period</dt><dd>{value(fields.coverage, dataset?.date_range, dataset?.temporal_coverage, glanceCoverage(dataset))}</dd></div>
      <div><dt>Scope</dt><dd>{value(dataset?.scope, dataset?.universe, dataset?.geography, dataset?.entity_universe)}</dd></div>
      <div><dt>Meaningful keys</dt><dd>{(fields.joinKeys || []).join(" · ") || "Not documented"}</dd></div>
      <div><dt>Documented scale</dt><dd>{rowCount ? `${Number.isFinite(Number(rowCount)) ? Number(rowCount).toLocaleString("en-US") : rowCount} rows` : "Not documented"}</dd></div>
    </dl>
  );
}

function StructureSummary({ dataset, presentation }) {
  const terms = recordTerms(dataset);
  if (presentation.kind !== "scholarly_work") return null;
  return (
    <div className="rd-v2-library-record-terms">
      <div>
        <span className="rd-v2-eyebrow">Record details</span>
        <strong>{terms.length ? `${terms.length} research term${terms.length === 1 ? "" : "s"}` : "Bibliographic metadata"}</strong>
      </div>
      {terms.length ? <div className="rd-v2-library-field-list">{terms.slice(0, 8).map((name) => <code key={name}>{name}</code>)}</div> : null}
    </div>
  );
}

export function LibraryAssetWorkspace({ dataset, onBack, onPreview, onOpenQuery, onPrepare, onRefreshData }) {
  const [overlay, setOverlay] = useState("");
  const [packageOpen, setPackageOpen] = useState(false);
  const packageAssets = useMemo(() => [dataset], [dataset]);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const refreshData = async () => {
    if (refreshBusy) return;
    setRefreshBusy(true);
    try { await onRefreshData(dataset); } finally { setRefreshBusy(false); }
  };
  const fields = useMemo(() => detailFields(dataset), [dataset]);
  const presentation = useMemo(() => libraryAssetPresentation(dataset), [dataset]);
  const state = statusPillKind(dataset);
  const verification = useMemo(() => libraryVerification(dataset), [dataset]);
  const holdings = useMemo(() => summarizeLibraryHoldings(dataset), [dataset]);
  const rowsLocked = licensedRowsLocked(dataset);
  const canQuery = state.kind === "query-ready" && !rowsLocked;
  const canDownload = useDeskPermission("download_research_data") !== false;
  const hasTableSurface = presentation.previewRows;
  const names = useMemo(() => fieldNames(dataset, fields), [dataset, fields]);
  const rowCount = dataset?.rows || dataset?.row_count || dataset?.num_rows || dataset?.records || dataset?.glance?.rows;
  const purpose = value(dataset?.recommended_use, dataset?.description, fields.use, "Research use is not described in the current registry metadata.");

  const factContent = (
    <>
      <div className="rd-v2-library-section-heading">
        <div><span className="rd-v2-eyebrow">Data facts</span><h2>{presentation.shapeTitle}</h2></div>
        {!hasTableSurface && presentation.kind !== "operational" ? (
          <button type="button" className="rd-v2-btn sm" onClick={() => setOverlay("fields")}>{presentation.structureAction}</button>
        ) : null}
      </div>
      <EvidenceShape dataset={dataset} fields={fields} presentation={presentation} rowCount={rowCount} state={state} />
      <div className="rd-v2-library-evidence-notes">
        <div>
          <span className="rd-v2-eyebrow">Research use</span>
          <p>{purpose}</p>
        </div>
        <div>
          <span className="rd-v2-eyebrow">Boundary</span>
          <p>{limitation(dataset, fields, presentation)}</p>
        </div>
      </div>
      <StructureSummary dataset={dataset} presentation={presentation} />
    </>
  );

  return (
    <PageShell
      className="rd-v2-library-workspace"
      headExtra={
        <div className="rd-v2-library-inspector-bar">
          <span className="rd-v2-library-inspector-context"><b>Library</b> <span aria-hidden="true">·</span> Inspect</span>
          <button type="button" className="rd-v2-btn sm" onClick={onBack} aria-label="Close data inspector">Close</button>
        </div>
      }
    >
      <article className="rd-v2-library-asset-canvas" data-testid="library-asset-workspace" data-asset-kind={presentation.kind}>
        <header className="rd-v2-library-asset-header">
          <div>
            <span className="rd-v2-eyebrow">{presentation.eyebrow}{dataset?.licensed ? " · University subscription" : ""}</span>
            <h1>{keepRangesTogether(displayName(dataset))}</h1>
            <p>{value(dataset?.description, dataset?.summary, dataset?.recommended_use, `This ${presentation.noun} has no plain-language description in the current registry.`)}</p>
          </div>
        </header>

        {listedSources(dataset).length ? (
          <section className="rd-v2-library-sources" aria-label="Sources for this dataset" data-testid="library-sources">
            <h2>{sourcesHeading(dataset)}</h2>
            <ul>
              {listedSources(dataset).map((source) => (
                <li key={source.dataset_id}>
                  <strong>{source.source_system || source.name}</strong>
                  <span>{source.name}</span>
                  <em>{source.held ? "Held on the desk" : "Collected on request"}</em>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="rd-v2-library-mobile-claims" role="group" aria-label="Evidence claims">
          <span>Readiness <strong>{state.label}</strong></span>
          <span>Verification <strong>{verification.label}</strong></span>
        </div>

        <div className="rd-v2-library-workspace-actions" role="group" aria-label="Data actions">
          {canQuery ? <button type="button" className="rd-v2-btn primary" onClick={onOpenQuery}>View all rows</button> : null}
          {rowsLocked ? (
            <button type="button" className="rd-v2-btn primary" onClick={() => requestDeskSignIn("signin")} data-testid="library-workspace-members-sign-in">Sign in with Yuan Ze email</button>
          ) : null}
          {datasetDownloadHref(dataset) ? (
            <a className="rd-v2-btn" href={datasetDownloadHref(dataset)} download data-testid="library-workspace-download">Download CSV</a>
          ) : dataset?.download_requires_account ? (
            <button type="button" className="rd-v2-btn" onClick={() => requestDeskSignIn("signup")} data-testid="library-workspace-download-sign-in">Sign in to download</button>
          ) : null}
          <span className="rd-v2-library-workspace-secondary">
            <button type="button" className="rd-v2-btn ghost" onClick={() => setOverlay("provenance")}>Source record</button>
            {presentation.noun === "dataset" ? <button type="button" className="rd-v2-btn ghost" onClick={() => setOverlay("cite")}>Cite</button> : null}
            {canQuery && canDownload ? <button type="button" className="rd-v2-btn ghost" onClick={() => setPackageOpen(true)}>Export with provenance</button> : null}
            {onRefreshData && collectionRecipe(dataset) ?
              <button type="button" className="rd-v2-btn ghost" disabled={refreshBusy} onClick={refreshData}>{refreshBusy ? "Preparing refresh…" : "Refresh data"}</button> : null}
            {holdings.count ? <button type="button" className="rd-v2-btn ghost" onClick={() => setOverlay("holdings")}>Your Library</button> : null}
          </span>
          {!canQuery && state.kind === "registered" && onPrepare ? (
            <button type="button" className="rd-v2-btn primary" onClick={onPrepare}>Prepare local copy</button>
          ) : null}
        </div>

        {hasTableSurface || datasetAnalysis(dataset) ? (
          <DatasetPreview
            dataset={dataset}
            canQuery={canQuery}
            names={names}
            fields={fields}
            state={state}
            presentation={presentation}
            onInspect={() => setOverlay("fields")}
            onExpandSample={onPreview}
          />
        ) : null}

        {hasTableSurface ? (
          <details className="rd-v2-library-asset-facts rd-v2-library-asset-facts-collapsible" data-testid="library-asset-facts">
            <summary>Research details</summary>
            <div className="rd-v2-library-asset-facts-body">{factContent}</div>
          </details>
        ) : (
          <section className="rd-v2-library-asset-facts" aria-label="Data facts" data-testid="library-asset-facts">
            {factContent}
          </section>
        )}
      </article>
      <AssetOverlay
        kind={overlay === "holdings" ? "" : overlay}
        dataset={dataset}
        fields={fields}
        presentation={presentation}
        onClose={() => setOverlay("")}
      />
      <LibraryHoldingsOverlay
        open={overlay === "holdings"}
        dataset={dataset}
        onClose={() => setOverlay("")}
      />
      <LibraryPackagePanel open={packageOpen} onClose={() => setPackageOpen(false)} assets={packageAssets} />
    </PageShell>
  );
}
