import { useEffect, useMemo, useState } from "react";
import { queryDataset } from "@/v2/api";
import {
  detailFields,
  displayName,
  libraryAssetPresentation,
  statusPillKind,
} from "@/v2/datasetMeta";
import { librarySourceReceipt } from "@/v2/libraryProvenance";
import { libraryVerification } from "@/v2/libraryVerification";
import { PageShell } from "@/v2/ui";

function value(...candidates) {
  return candidates.map((item) => String(item || "").trim()).find(Boolean) || "Not declared";
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
    return "Library registration confirms the work is retained; it does not establish source verification or methodological fitness.";
  }

  const state = statusPillKind(dataset).kind;
  if (state === "connected") {
    return "A live source connection does not establish instant local query access or a materialized local copy.";
  }
  if (state === "remote") {
    return "Metadata availability does not establish a queryable local asset.";
  }
  if (state === "registered") {
    return "Registration does not establish a verified local query path.";
  }
  if (state === "queued") {
    return "Queued acquisition does not establish that the requested evidence has been obtained.";
  }
  if (state === "failed") {
    return "A failed asset path does not establish usable evidence until the failure is resolved.";
  }
  if (state === "warn") {
    return "The current readiness warning prevents this asset from establishing analysis-ready evidence.";
  }
  if (state === "unknown") {
    return "Current metadata does not establish a usable query path or complete evidence boundary.";
  }
  if (state === "query-ready") {
    return "Query readiness establishes access, not field completeness or fitness for every research design.";
  }
  return "The current registry record does not establish this asset's full research boundary.";
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

function AssetOverlay({ kind, dataset, fields, presentation, onClose }) {
  if (!kind) return null;
  const scholarly = presentation.kind === "scholarly_work";
  const liveSource = presentation.kind === "live_source";
  const title = kind === "fields" ? presentation.structureTitle : "Source and provenance";
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
          <button type="button" className="rd-v2-btn sm" onClick={onClose} aria-label="Close inspection">Close</button>
        </header>
        {kind === "fields" ? (
          scholarly ? (
            <>
              <p>
                Bibliographic and holding metadata for {displayName(dataset)}. This describes the research object; it does not pretend a paper has tabular fields or join keys.
              </p>
              <dl className="rd-v2-library-overlay-facts">
                <div><dt>Object type</dt><dd>Scholarly work</dd></div>
                <div><dt>Identifier</dt><dd>{value(dataset?.doi, dataset?.url, dataset?.dataset_id)}</dd></div>
                <div><dt>Source</dt><dd>{value(fields.source, dataset?.source_system, dataset?.publisher)}</dd></div>
                <div><dt>Access record</dt><dd>{value(dataset?.access_mode, dataset?.access_shape, dataset?.backend)}</dd></div>
              </dl>
              {terms.length ? (
                <div className="rd-v2-library-field-list" aria-label="Research terms">
                  {terms.map((name) => <code key={name}>{name}</code>)}
                </div>
              ) : null}
            </>
          ) : liveSource ? (
            <>
              <p>Declared response fields for {displayName(dataset)}. These describe the connected source contract; they are not an observed local row sample.</p>
              {names.length ? (
                <div className="rd-v2-library-field-list">
                  {names.map((name) => <code key={name}>{name}</code>)}
                </div>
              ) : (
                <p className="rd-v2-library-muted">No declared response fields are available in the current registry record.</p>
              )}
              <dl className="rd-v2-library-overlay-facts">
                <div><dt>Access route</dt><dd>{value(dataset?.collect_via, dataset?.backend, fields.access)}</dd></div>
                <div><dt>Coverage</dt><dd>{value(fields.coverage, dataset?.coverage)}</dd></div>
              </dl>
            </>
          ) : (
            <>
              <p>Declared fields and operations for {displayName(dataset)}. They are registry metadata until a local preview is observed.</p>
              {names.length ? (
                <div className="rd-v2-library-field-list">
                  {names.map((name) => <code key={name}>{name}</code>)}
                </div>
              ) : (
                <p className="rd-v2-library-muted">No declared fields are available in the current registry record.</p>
              )}
              <dl className="rd-v2-library-overlay-facts">
                <div><dt>Grain</dt><dd>{value(dataset?.grain)}</dd></div>
                <div><dt>Coverage</dt><dd>{value(fields.coverage, dataset?.coverage)}</dd></div>
                <div><dt>Join keys</dt><dd>{names.filter((name) => (fields.joinKeys || []).includes(name)).join(" · ") || "Not declared"}</dd></div>
              </dl>
            </>
          )
        ) : (
          <>
            <p>
              Reproducibility receipt for this Library asset. Provider identity, source location, acquisition method, verification, and use readiness remain separate claims.
            </p>
            <dl className="rd-v2-library-overlay-facts" data-testid="library-provenance-receipt">
              <div><dt>Source authority</dt><dd>{value(fields.source, dataset?.source, dataset?.publisher)}</dd></div>
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
              <ReceiptFact label="Source route" value={receipt.route} mono testId="library-source-route" />
              <ReceiptFact label="Upstream assets" value={receipt.upstream} mono />
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
                ].filter(Boolean).join(" and ")} for this asset.
              </p>
            ) : null}
            <details className="rd-v2-library-tech-disclosure">
              <summary>Technical details</summary>
              <dl className="rd-v2-library-overlay-facts compact">
                <div><dt>Library ID</dt><dd><code>{dataset?.dataset_id || "Not declared"}</code></dd></div>
                <ReceiptFact label="Source endpoint" value={receipt.sourceEndpoint} mono />
                <div><dt>Vault path</dt><dd><code>{fields.vault || "Not declared"}</code></dd></div>
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

function DatasetPreview({ dataset, canQuery, names, fields, state, presentation, onInspect, onOpenFullPreview }) {
  const [preview, setPreview] = useState({ loading: false, rows: [], error: "" });

  useEffect(() => {
    let cancelled = false;
    if (!canQuery || !dataset?.dataset_id) {
      setPreview({ loading: false, rows: [], error: "" });
      return undefined;
    }
    setPreview({ loading: true, rows: [], error: "" });
    queryDataset(dataset.dataset_id, 8)
      .then((payload) => {
        if (!cancelled) {
          setPreview({
            loading: false,
            rows: Array.isArray(payload?.rows) ? payload.rows.slice(0, 8) : [],
            error: "",
          });
        }
      })
      .catch(() => {
        if (!cancelled) setPreview({ loading: false, rows: [], error: "Preview is not available right now." });
      });
    return () => { cancelled = true; };
  }, [canQuery, dataset?.dataset_id]);

  const columns = observedColumns(preview.rows);
  const schemaColumns = columns.length ? columns : names.slice(0, 12);
  const observed = columns.length > 0 && preview.rows.length > 0;
  const joinKeys = fields.joinKeys || [];
  const rowCount = dataset?.rows || dataset?.row_count || dataset?.num_rows || dataset?.records;
  const liveSource = presentation.kind === "live_source";
  const coverage = String(fields.coverage || dataset?.coverage || "").trim();
  const grain = String(dataset?.grain || "").trim();

  return (
    <section className="rd-v2-library-data-preview" aria-label="Dataset table and structure" data-testid="library-data-preview">
      <div className="rd-v2-library-section-heading">
        <div>
          <span className="rd-v2-eyebrow">{liveSource ? "Source inspection" : "Dataset inspection"}</span>
          <h2>{observed ? (liveSource ? "Observed response sample" : "Observed table") : (liveSource ? "Declared response shape" : "Table structure")}</h2>
        </div>
        <div className="rd-v2-library-preview-tools">
          {observed ? (
            <span className="rd-v2-library-observation-receipt" data-testid="library-observation-receipt">
              {preview.rows.length} row{preview.rows.length === 1 ? "" : "s"} · {columns.length} column{columns.length === 1 ? "" : "s"}
            </span>
          ) : null}
          <button type="button" className="rd-v2-btn sm" onClick={onInspect}>Inspect schema</button>
          {canQuery && onOpenFullPreview ? (
            <button type="button" className="rd-v2-btn sm" onClick={onOpenFullPreview}>Full preview</button>
          ) : null}
        </div>
      </div>

      {preview.loading ? <p className="rd-v2-library-muted">Reading a bounded local sample…</p> : null}
      {!preview.loading && preview.error ? <p className="rd-v2-library-muted">{preview.error}</p> : null}
      {!preview.loading && !preview.error && canQuery && !preview.rows.length ? (
        <p className="rd-v2-library-muted">The current query path returned no sample rows.</p>
      ) : null}

      {schemaColumns.length ? (
        <div className="rd-v2-library-glimpse-table-wrap">
          <table className="rd-v2-library-glimpse-table">
            <thead>
              <tr>{schemaColumns.map((column) => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {observed ? (
                preview.rows.map((row, index) => (
                  <tr key={index}>
                    {schemaColumns.map((column) => <td key={column}>{String(row[column] ?? "—")}</td>)}
                  </tr>
                ))
              ) : (
                <tr className="rd-v2-library-schema-only-row">
                  <td colSpan={Math.max(schemaColumns.length, 1)}>
                    {canQuery
                      ? "Observed rows are not available in this sample."
                      : liveSource
                        ? `${state.label} does not establish an observed response sample; the fields above are declared structure only.`
                        : `${state.label} does not establish an observed row preview; the columns above are declared structure only.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rd-v2-library-preview-empty">
          <strong>{liveSource ? "No response structure is available yet." : "No table structure is available yet."}</strong>
          <span>{state.label} does not currently expose {liveSource ? "declared response fields" : "observed columns or a declared field list"}.</span>
        </div>
      )}

      <div className="rd-v2-library-preview-foot">
        <span>{observed ? "Observed values from the current query path" : "Declared structure only"}</span>
        {coverage ? <span>Coverage: {coverage}</span> : !liveSource ? <span>Coverage: Not declared</span> : null}
        {liveSource ? null : <span>Grain: {grain || "Not declared"}</span>}
        {liveSource ? null : <span>Scale: {rowCount ? `${rowCount} rows` : "Not declared"}</span>}
        {liveSource ? (joinKeys.length ? <span>Keys: {joinKeys.join(" · ")}</span> : null) : <span>Keys: {joinKeys.length ? joinKeys.join(" · ") : "Not declared"}</span>}
      </div>
    </section>
  );
}

function EvidenceShape({ dataset, fields, presentation, rowCount, state }) {
  if (presentation.kind === "scholarly_work") {
    return (
      <dl className="rd-v2-library-evidence-facts">
        <div><dt>Object type</dt><dd>Scholarly work</dd></div>
        <div><dt>Identifier</dt><dd>{value(dataset?.doi, dataset?.url, dataset?.dataset_id)}</dd></div>
        <div><dt>Source</dt><dd>{value(fields.source, dataset?.source_system, dataset?.publisher)}</dd></div>
        <div><dt>Access</dt><dd>{value(dataset?.access_mode, dataset?.access_shape, dataset?.backend)}</dd></div>
        <div><dt>Library state</dt><dd>{state.label}</dd></div>
      </dl>
    );
  }
  if (presentation.kind === "live_source") {
    return (
      <dl className="rd-v2-library-evidence-facts">
        <div><dt>Object type</dt><dd>{state.kind === "connected" ? "Connected source" : "Live source"}</dd></div>
        <div><dt>Source</dt><dd>{value(fields.source, dataset?.source_system)}</dd></div>
        <div><dt>Access route</dt><dd>{value(dataset?.collect_via, dataset?.backend, fields.access)}</dd></div>
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
        <div><dt>Access</dt><dd>{value(dataset?.access_mode, dataset?.backend, fields.access)}</dd></div>
        <div><dt>State</dt><dd>{state.label}</dd></div>
        <div><dt>Coverage</dt><dd>{value(fields.coverage, dataset?.coverage)}</dd></div>
      </dl>
    );
  }
  return (
    <dl className="rd-v2-library-evidence-facts">
      <div><dt>Unit / grain</dt><dd>{value(dataset?.grain)}</dd></div>
      <div><dt>Period</dt><dd>{value(fields.coverage, dataset?.date_range, dataset?.temporal_coverage)}</dd></div>
      <div><dt>Scope</dt><dd>{value(dataset?.scope, dataset?.universe, dataset?.geography, dataset?.entity_universe)}</dd></div>
      <div><dt>Meaningful keys</dt><dd>{(fields.joinKeys || []).join(" · ") || "Not declared"}</dd></div>
      <div><dt>Declared scale</dt><dd>{rowCount ? `${rowCount} rows` : "Not declared"}</dd></div>
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

export function LibraryAssetWorkspace({ dataset, onBack, onPreview, onOpenQuery, onPrepare }) {
  const [overlay, setOverlay] = useState("");
  const fields = useMemo(() => detailFields(dataset), [dataset]);
  const presentation = useMemo(() => libraryAssetPresentation(dataset), [dataset]);
  const state = statusPillKind(dataset);
  const verification = useMemo(() => libraryVerification(dataset), [dataset]);
  const canQuery = state.kind === "query-ready";
  const hasTableSurface = presentation.previewRows;
  const names = useMemo(() => fieldNames(dataset, fields), [dataset, fields]);
  const rowCount = dataset?.rows || dataset?.row_count || dataset?.num_rows || dataset?.records;
  const purpose = value(dataset?.recommended_use, dataset?.description, fields.use, "Research use is not described in the current registry metadata.");

  const factContent = (
    <>
      <div className="rd-v2-library-section-heading">
        <div><span className="rd-v2-eyebrow">Asset facts</span><h2>{presentation.shapeTitle}</h2></div>
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
      title="Library"
      lead="Inspect held evidence."
      headExtra={<button type="button" className="rd-v2-btn sm" onClick={onBack}>← All Library assets</button>}
    >
      <article className="rd-v2-library-asset-canvas" data-testid="library-asset-workspace" data-asset-kind={presentation.kind}>
        <header className="rd-v2-library-asset-header">
          <div>
            <span className="rd-v2-eyebrow">{presentation.eyebrow}</span>
            <h1>{displayName(dataset)}</h1>
            <p>{value(dataset?.description, dataset?.summary, dataset?.recommended_use, `This ${presentation.noun} has no plain-language description in the current registry.`)}</p>
          </div>
        </header>

        <div className="rd-v2-library-claim-strip" aria-label="Evidence claims">
          <div><span>Readiness</span><strong>{state.label}</strong></div>
          <div><span>Verification</span><strong>{verification.label}</strong></div>
          <div><span>Source</span><strong>{value(fields.source, dataset?.source, dataset?.publisher)}</strong></div>
        </div>

        <div className="rd-v2-library-workspace-actions" aria-label="Asset actions">
          {canQuery ? <button type="button" className="rd-v2-btn primary" onClick={onOpenQuery}>Open query</button> : null}
          <button type="button" className="rd-v2-btn" onClick={() => setOverlay("provenance")}>Source record</button>
          {!canQuery && state.kind === "registered" && onPrepare ? (
            <button type="button" className="rd-v2-btn primary" onClick={onPrepare}>Prepare local copy</button>
          ) : null}
        </div>

        {hasTableSurface ? (
          <DatasetPreview
            dataset={dataset}
            canQuery={canQuery}
            names={names}
            fields={fields}
            state={state}
            presentation={presentation}
            onInspect={() => setOverlay("fields")}
            onOpenFullPreview={onPreview}
          />
        ) : null}

        {hasTableSurface ? (
          <details className="rd-v2-library-asset-facts rd-v2-library-asset-facts-collapsible" data-testid="library-asset-facts">
            <summary>Research details</summary>
            <div className="rd-v2-library-asset-facts-body">{factContent}</div>
          </details>
        ) : (
          <section className="rd-v2-library-asset-facts" aria-label="Asset facts" data-testid="library-asset-facts">
            {factContent}
          </section>
        )}
      </article>
      <AssetOverlay
        kind={overlay}
        dataset={dataset}
        fields={fields}
        presentation={presentation}
        onClose={() => setOverlay("")}
      />
    </PageShell>
  );
}