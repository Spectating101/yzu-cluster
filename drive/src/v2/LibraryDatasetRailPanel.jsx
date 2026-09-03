import {
  canIUseDecision,
  demotionSentence,
  detailFields,
  hydrateRemedy,
  libraryAssetPresentation,
  statusPillKind,
} from "@/v2/datasetMeta";
import { hasReproductionMethod, librarySourceReceipt } from "@/v2/libraryProvenance";
import { libraryVerification } from "@/v2/libraryVerification";
import { RailFrame, RailStickyFooter } from "@/v2/RailFrame";

export function decisionFor(dataset) {
  return canIUseDecision(dataset);
}

function sourceAuthorityValue(dataset) {
  if (dataset?.self_provided || dataset?.upload) return "Self-provided";
  const provenance = typeof dataset?.provenance === "string" ? dataset.provenance.trim() : "";
  return String(
    dataset?.source ||
      dataset?.publisher ||
      dataset?.source_system ||
      provenance ||
      "",
  ).trim();
}

function accessRouteValue(dataset, fields) {
  return String(dataset?.collect_via || dataset?.backend || fields.access || "").trim();
}

function unknowns(dataset, fields, presentation, receipt) {
  const out = [];
  const demotion = demotionSentence(dataset);
  if (demotion) out.push(demotion);

  if (!sourceAuthorityValue(dataset)) {
    out.push("Source authority not recorded");
  }
  if (!dataset?.self_provided && !dataset?.upload && !receipt.sourceUrl) {
    out.push("Exact source URL not recorded");
  }
  if (!hasReproductionMethod(receipt)) {
    out.push("Reproduction method not recorded");
  }

  if (presentation.kind === "scholarly_work") {
    if (!dataset?.doi && !dataset?.url && !receipt.sourceUrl) out.push("Stable identifier not reported");
    return out;
  }

  if (presentation.kind === "live_source") {
    if (!accessRouteValue(dataset, fields) && !receipt.method) out.push("Access route not reported");
    if (!Array.isArray(dataset?.columns) && !Array.isArray(dataset?.fields)) out.push("Declared response shape not reported");
    if (!dataset?.updated_at && !dataset?.last_modified && !dataset?.as_of) out.push("Connection freshness not described");
    return out;
  }

  if (presentation.kind === "operational") {
    if (!dataset?.updated_at && !dataset?.last_modified && !dataset?.as_of) out.push("Recorded state freshness not described");
    return out;
  }

  if (!dataset?.analysis_readiness) out.push("Readiness not reported by registry");
  if (!fields.coverage && !dataset?.coverage && !dataset?.date_range) out.push("Coverage not reported");
  if (!dataset?.grain) out.push("Grain not reported");
  if (!dataset?.updated_at && !dataset?.last_modified && !dataset?.as_of) {
    out.push("Freshness / last refresh not described");
  }
  if (!fields.joinKeys?.length) out.push("Join keys / schema relationship not described");
  if (!(dataset?.limitations || dataset?.caveats || fields.limitations)) out.push("Known caveats not described");
  return out;
}

function knownBoundaries(dataset, fields) {
  const raw = dataset?.limitations || dataset?.caveats || fields.limitations;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
  return [String(raw).trim()].filter(Boolean);
}

function Fact({ label, value, mono = false, href = "" }) {
  if (value == null || value === "") return null;
  return (
    <div className="rd-v2-library-inspector-fact">
      <span>{label}</span>
      <strong className={mono ? "mono" : undefined}>
        {href ? <a href={href} target="_blank" rel="noreferrer">{value}</a> : value}
      </strong>
    </div>
  );
}

function sourceAuthorityLine(dataset) {
  return sourceAuthorityValue(dataset) || "Source authority absent";
}

function askLabel(presentation, state) {
  if (state.kind === "query-ready") return "Ask about this →";
  if (presentation.kind === "scholarly_work") return "Ask about this work →";
  if (presentation.kind === "operational") return "Ask about this record →";
  return "Ask about access →";
}

function reproductionLabel(receipt) {
  if (receipt.command) return "Reproduce command";
  if (receipt.script) return "Script";
  if (receipt.route) return "Route";
  return "";
}

function reproductionValue(receipt) {
  return receipt.command || receipt.script || receipt.route || "";
}

function provenanceBasis(dataset, receipt) {
  if (dataset?.self_provided || dataset?.upload) return "Self-provided";
  if (receipt.sourceUrl) return "Exact source recorded";
  if (sourceAuthorityValue(dataset)) return "Authority named";
  return "Not established";
}

function reproductionBasis(receipt) {
  return hasReproductionMethod(receipt) ? "Method recorded" : "Method missing";
}

function nextMove({ state, presentation, previewOpen, receipt, verification }) {
  if (previewOpen) {
    return "Review the bounded preview in the centre. Previewing rows does not upgrade verification or provenance.";
  }
  if (state.kind === "query-ready") {
    if (!hasReproductionMethod(receipt)) {
      return "Inspect the full preview or open a query now; record a reproduction method before treating the workflow as fully reproducible.";
    }
    if (verification.kind !== "verified" && verification.kind !== "matched") {
      return "Inspect the full preview or open a query now, while keeping verification separate from query readiness.";
    }
    return "Inspect the full preview for row-level context, then open a query when you need analysis beyond the bounded sample.";
  }
  if (state.kind === "connected") {
    return "Use the declared remote route. Connected means reachable, not that a local query-ready copy exists.";
  }
  if (state.kind === "registered") {
    if (presentation.kind === "scholarly_work") {
      return "Use the bibliographic record as evidence, then verify the stable source before making a stronger source claim.";
    }
    return "Inspect the source record and prepare a usable local copy before treating this asset as queryable evidence.";
  }
  return "Resolve the outstanding readiness or provenance gaps before relying on this asset in analysis.";
}

function DecisionBasis({ state, verification, dataset, receipt, previewOpen, presentation }) {
  const rows = [
    ["Readiness", state.label],
    ["Verification", verification.label],
    ["Provenance", provenanceBasis(dataset, receipt)],
    ["Reproduce", reproductionBasis(receipt)],
  ];
  return (
    <section className="rd-v2-library-inspector-basis" aria-label="Decision basis" data-testid="library-decision-basis">
      <p className="rd-v2-rail-section-label">Decision basis</p>
      <div className="rd-v2-library-inspector-basis-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="rd-v2-library-inspector-next">
        <span>{previewOpen ? "Preview state" : "Next move"}</span>
        <p>{nextMove({ state, presentation, previewOpen, receipt, verification })}</p>
      </div>
    </section>
  );
}

/**
 * The centre workspace owns asset substance (table/schema, coverage, grain,
 * research use). The global situation strip owns selected-asset identity. The
 * rail is therefore decisional: usability, provenance, verification,
 * unresolved facts, and the next valid research move.
 */
export function LibraryDatasetRailPanel({ dataset, previewOpen = false, onAskAbout }) {
  if (!dataset) return null;
  const fields = detailFields(dataset);
  const presentation = libraryAssetPresentation(dataset);
  const state = statusPillKind(dataset);
  const decision = decisionFor(dataset);
  const receipt = librarySourceReceipt(dataset);
  const missing = unknowns(dataset, fields, presentation, receipt);
  const boundaries = knownBoundaries(dataset, fields);
  const updated = dataset.updated_at || dataset.last_modified || dataset.as_of;
  const verification = libraryVerification(dataset);
  const remedy = hydrateRemedy(dataset);
  const archiveRef = String(dataset?.canonical_remote || dataset?.lineage?.canonical_remote || "").trim();
  const accessRoute = accessRouteValue(dataset, fields);
  const authority = sourceAuthorityValue(dataset);
  const hasReceiptDetails = Boolean(
    receipt.sourceUrl || receipt.method || reproductionValue(receipt) || receipt.upstream || accessRoute,
  );

  return (
    <RailFrame>
      <section
        className={`rd-v2-library-inspector-decision rd-v2-library-inspector-decision-${state.kind}`}
        aria-label="Can I use this?"
        data-testid={demotionSentence(dataset) ? "library-demotion-sentence" : undefined}
      >
        <p className="rd-v2-rail-section-label">Can I use this?</p>
        <h3>{decision.headline}</h3>
        <p>{decision.body}</p>
      </section>

      {remedy ? (
        <section
          className="rd-v2-library-inspector-decision"
          aria-label="Restore from archive"
          data-testid="library-hydrate-remedy"
        >
          <p className="rd-v2-rail-section-label">Restore from archive</p>
          <p>{remedy}</p>
          {archiveRef ? <p className="rd-v2-library-inspector-prose muted mono">{archiveRef}</p> : null}
        </section>
      ) : null}

      <div className="rd-v2-rail-scroll rd-v2-library-inspector-scroll">
        <DecisionBasis
          state={state}
          verification={verification}
          dataset={dataset}
          receipt={receipt}
          previewOpen={previewOpen}
          presentation={presentation}
        />

        <section className="rd-v2-library-inspector-block" aria-label="Source" data-testid="library-rail-source">
          <p className="rd-v2-rail-section-label">Source &amp; reproduce</p>
          <h3 className="rd-v2-library-rail-module-title">{sourceAuthorityLine(dataset)}</h3>
          {hasReceiptDetails ? (
            <div className="rd-v2-library-inspector-facts rd-v2-library-provenance-facts">
              <Fact label={receipt.sourceUrlKind || "Exact source URL"} value={receipt.sourceUrl} href={receipt.sourceUrl} mono />
              <Fact label="Access route" value={accessRoute} mono />
              <Fact label="Method" value={receipt.method} />
              <Fact label={reproductionLabel(receipt)} value={reproductionValue(receipt)} mono />
              <Fact label="Upstream assets" value={receipt.upstream} mono />
            </div>
          ) : (
            <p className="rd-v2-library-inspector-prose muted">
              {authority
                ? "The source authority is named, but no exact reproduction receipt is recorded for this asset."
                : "No source authority or exact reproduction receipt is recorded for this asset."}
            </p>
          )}
        </section>

        <section className="rd-v2-library-inspector-block" aria-label="Verification" data-testid="library-rail-verification">
          <p className="rd-v2-rail-section-label">Verification</p>
          <h3 className="rd-v2-library-rail-module-title">{verification.label}</h3>
          <p className="rd-v2-library-inspector-prose">{verification.body}</p>
          {verification.checks.length ? (
            <ul className="rd-v2-library-verify-list known">
              {verification.checks.map((item) => (
                <li key={item}><span aria-hidden>✓</span>{item}</li>
              ))}
            </ul>
          ) : null}
          {verification.unknowns.length ? (
            <ul className="rd-v2-library-verify-list unknown">
              {verification.unknowns.map((item) => (
                <li key={item}><span aria-hidden>?</span>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>

        {boundaries.length ? (
          <section className="rd-v2-library-inspector-block" aria-label="Known boundary" data-testid="library-known-boundary">
            <p className="rd-v2-rail-section-label">Known boundary</p>
            <ul className="rd-v2-library-verify-list known">
              {boundaries.map((item) => <li key={item}><span aria-hidden>•</span>{item}</li>)}
            </ul>
          </section>
        ) : null}

        {missing.length ? (
          <section className="rd-v2-library-inspector-block rd-v2-library-inspector-unknown" aria-label="Still unknown">
            <p className="rd-v2-rail-section-label">Still unknown</p>
            <h3 className="rd-v2-library-rail-module-title">
              {missing.length} unresolved fact{missing.length === 1 ? "" : "s"}
            </h3>
            <ul>
              {missing.map((item) => <li key={item}><span aria-hidden>?</span>{item}</li>)}
            </ul>
          </section>
        ) : null}

        <details className="rd-v2-library-inspector-tech">
          <summary>Technical details</summary>
          <div className="rd-v2-library-inspector-tech-body">
            <Fact label="Library ID" value={dataset.dataset_id} mono />
            <Fact label="Registry readiness" value={dataset.analysis_readiness || "not declared"} mono />
            <Fact label="Backend" value={dataset.backend} mono />
            <Fact label="Source endpoint" value={receipt.sourceEndpoint} mono />
            <Fact label="Vault path" value={fields.vault} mono />
            <Fact label="Canonical archive" value={archiveRef || null} mono />
            <Fact label="Updated" value={updated} />
            <Fact label="Fetched" value={receipt.fetchedAt} />
            <Fact label="Content SHA-256" value={receipt.contentSha256} mono />
            {state.kind === "query-ready" ? <Fact label="Query path" value={dataset.dataset_id ? `/query/${dataset.dataset_id}?limit=50` : null} mono /> : null}
          </div>
        </details>
      </div>

      <RailStickyFooter>
        {previewOpen ? (
          <span className="rd-v2-library-preview-state" data-testid="library-preview-open-state">
            Preview open in centre
          </span>
        ) : null}
        <button type="button" className="rd-v2-btn primary sm" onClick={onAskAbout}>
          {askLabel(presentation, state)}
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}
