import { uiVocabularyLabel } from "./uiVocabularyLabels.js";
import {
  canIUseDecision,
  demotionSentence,
  detailFields,
  hydrateRemedy,
  libraryAssetPresentation,
  statusPillKind,
} from "@/v2/datasetMeta";
import { freshnessDate, summarizeLibraryFreshness } from "@/v2/libraryFreshness";
import { hasReproductionMethod, librarySourceReceipt } from "@/v2/libraryProvenance";
import { libraryVerification } from "@/v2/libraryVerification";
import { holdingRoleLabel, summarizeLibraryHoldings } from "@/v2/libraryHoldings";
import { RailFrame, RailStickyFooter } from "@/v2/RailFrame";
import { plainRoute } from "@/v2/plainText";

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

function unknowns(dataset, fields, presentation, receipt, freshness) {
  const out = [];
  const demotion = demotionSentence(dataset);
  if (demotion) out.push(demotion);

  if (!sourceAuthorityValue(dataset)) {
    out.push("Source not recorded");
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
    if (!accessRouteValue(dataset, fields) && !receipt.method) out.push("Access not reported");
    if (!Array.isArray(dataset?.columns) && !Array.isArray(dataset?.fields)) out.push("Documented response shape not reported");
    if (!dataset?.last_checked_at && !dataset?.checked_at && !freshness.lastRefreshedAt && !freshness.dataAsOf) {
      out.push("Connection freshness not described");
    }
    return out;
  }

  if (presentation.kind === "operational") {
    if (!dataset?.updated_at && !dataset?.last_modified && !dataset?.as_of) out.push("Recorded state freshness not described");
    return out;
  }

  if (!dataset?.analysis_readiness) out.push("Readiness not reported by registry");
  if (!fields.coverage && !dataset?.coverage && !dataset?.date_range) out.push("Coverage not reported");
  if (!dataset?.grain) out.push("Unit of observation not reported");
  if (!freshness.hasFreshnessEvidence) {
    out.push("Data freshness / refresh cadence not recorded");
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
  return sourceAuthorityValue(dataset) || "Source not recorded";
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
  if (sourceAuthorityValue(dataset)) return "Source named";
  return "Not established";
}

function nextMove({ state, presentation, previewOpen, receipt, verification, freshness }) {
  if (previewOpen) {
    return "Review the expanded sample in the centre. Observed rows do not upgrade verification, provenance, or freshness.";
  }
  if (freshness.stale) {
    return "Refresh the evidence pipeline before using this copy for time-sensitive analysis; query readiness does not make stale data current.";
  }
  if (state.kind === "query-ready") {
    if (!hasReproductionMethod(receipt)) {
      return "Open a query when you need analysis; inspect the Source record before treating the workflow as fully reproducible.";
    }
    if (verification.kind !== "verified" && verification.kind !== "matched") {
      return "Open a query when you need analysis, while keeping verification separate from query readiness.";
    }
    return "Use the sample for a quick value check. Open a query for analysis beyond the sample.";
  }
  if (state.kind === "connected") {
    return "Use the documented remote connection. Connected means the source is reachable. It does not confirm a local copy ready to query.";
  }
  if (state.kind === "registered") {
    if (presentation.kind === "scholarly_work") {
      return "Use the bibliographic record as evidence, then verify the stable source before making a stronger source claim.";
    }
    return "Inspect the source record and prepare a usable local copy before treating this data as ready to query.";
  }
  return "Resolve the readiness or source history gaps before relying on this data in analysis.";
}

function DecisionBasis({ state, verification, dataset, receipt, previewOpen, presentation, freshness }) {
  const rows = [
    ["Readiness", state.label],
    ["Verification", verification.label],
    ["Provenance", provenanceBasis(dataset, receipt)],
    ["Freshness", freshness.basisLabel],
  ];
  return (
    <section className="rd-v2-library-inspector-basis" aria-label="Why this status" data-testid="library-decision-basis">
      <p className="rd-v2-rail-section-label">Why this status</p>
      <div className="rd-v2-library-inspector-basis-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="rd-v2-library-inspector-next">
        <span>{previewOpen ? "Sample state" : "Next move"}</span>
        <p>{nextMove({ state, presentation, previewOpen, receipt, verification, freshness })}</p>
      </div>
    </section>
  );
}

function HoldingsBlock({ summary }) {
  if (!summary.count) return null;
  const focus = summary.focus;
  const otherProviders = summary.providers.filter((provider) => provider !== focus?.provider);
  const focusLabel = focus?.active ? "Using" : focus?.primary ? "Primary copy" : "Known copy";
  const focusContext = focus ? [focus.custodian, holdingRoleLabel(focus)].filter(Boolean).join(" · ") : "";
  return (
    <section
      className="rd-v2-library-inspector-block rd-v2-library-inspector-holdings"
      aria-label="Your Library"
      data-testid="library-rail-holdings"
    >
      <p className="rd-v2-rail-section-label">Your Library</p>
      <h3 className="rd-v2-library-rail-module-title">{summary.headline}</h3>
      {focus ? (
        <div className="rd-v2-library-holding-focus">
          <span>{focusLabel}</span>
          <strong>{focus.provider}</strong>
          {focusContext ? <small>{focusContext}</small> : null}
        </div>
      ) : null}
      {otherProviders.length ? (
        <p className="rd-v2-library-holdings-provider-line">{otherProviders.join(" · ")}</p>
      ) : null}
    </section>
  );
}

/**
 * The centre workspace owns asset substance (table/schema, coverage, grain,
 * research use). The global situation strip owns selected-asset identity. The
 * rail is therefore decisional: usability, freshness, provenance, verification,
 * unresolved facts, and the next valid research move.
 */
export function LibraryDatasetRailPanel({ dataset, previewOpen = false, onAskAbout }) {
  if (!dataset) return null;
  const fields = detailFields(dataset);
  const presentation = libraryAssetPresentation(dataset);
  const state = statusPillKind(dataset);
  const decision = decisionFor(dataset);
  const receipt = librarySourceReceipt(dataset);
  const freshness = summarizeLibraryFreshness(dataset, { kind: presentation.kind });
  const missing = unknowns(dataset, fields, presentation, receipt, freshness);
  const boundaries = knownBoundaries(dataset, fields);
  const verification = libraryVerification(dataset);
  const holdings = summarizeLibraryHoldings(dataset);
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
        <p>{uiVocabularyLabel(decision.body)}</p>
        {freshness.stale ? (
          <p data-testid="library-stale-warning">Freshness is stale even though the current copy may remain technically queryable.</p>
        ) : null}
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
          freshness={freshness}
        />

        <HoldingsBlock summary={holdings} />

        <section className="rd-v2-library-inspector-block" aria-label="Source" data-testid="library-rail-source">
          <p className="rd-v2-rail-section-label">Source &amp; reproduce</p>
          <h3 className="rd-v2-library-rail-module-title">{sourceAuthorityLine(dataset)}</h3>
          {hasReceiptDetails ? (
            <div className="rd-v2-library-inspector-facts rd-v2-library-provenance-facts">
              <Fact label={receipt.sourceUrlKind || "Exact source URL"} value={receipt.sourceUrl} href={receipt.sourceUrl} mono />
              <Fact label="Access" value={plainRoute(accessRoute)} />
              <Fact label="Method" value={plainRoute(receipt.method)} />
              <Fact label={reproductionLabel(receipt)} value={reproductionValue(receipt)} mono />
              <Fact label="Upstream datasets" value={receipt.upstream} mono />
            </div>
          ) : (
            <p className="rd-v2-library-inspector-prose muted">
              {authority
                ? "The source is named, but no record of how to reproduce this dataset is saved."
                : "No source verification or reproduction record is saved for this dataset."}
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
            {holdings.count ? <Fact label="Known holdings" value={String(holdings.count)} /> : null}
            <Fact label="Registry readiness" value={dataset.analysis_readiness || "not declared"} mono />
            <Fact label="Backend" value={dataset.backend} mono />
            <Fact label="Source endpoint" value={receipt.sourceEndpoint} mono />
            <Fact label="Vault path" value={fields.vault} mono />
            <Fact label="Canonical archive" value={archiveRef || null} mono />
            <Fact label="Data as of" value={freshness.dataAsOf ? freshnessDate(freshness.dataAsOf, { year: true }) : null} />
            <Fact label="Last data refresh" value={freshness.lastRefreshedAt || null} />
            <Fact label="Refresh cadence" value={freshness.cadenceLabel || null} />
            <Fact label="Next expected refresh" value={freshness.nextRefreshAt || null} />
            <Fact label="Refresh status" value={freshness.status || (freshness.stale ? "stale" : null)} />
            <Fact label="Record updated" value={freshness.recordUpdatedAt || null} />
            <Fact label="Fetched" value={receipt.fetchedAt} />
            <Fact label="Content SHA-256" value={receipt.contentSha256} mono />
            {state.kind === "query-ready" ? <Fact label="Query path" value={dataset.dataset_id ? `/query/${dataset.dataset_id}?limit=50` : null} mono /> : null}
          </div>
        </details>
      </div>

      <RailStickyFooter>
        {previewOpen ? (
          <span className="rd-v2-library-preview-state" data-testid="library-preview-open-state">
            Expanded sample open in centre
          </span>
        ) : null}
        <button type="button" className="rd-v2-btn primary sm" onClick={onAskAbout}>
          {askLabel(presentation, state)}
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}
