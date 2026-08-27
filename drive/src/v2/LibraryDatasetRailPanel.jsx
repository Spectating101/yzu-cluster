import {
  canIUseDecision,
  demotionSentence,
  detailFields,
  hydrateRemedy,
  libraryAssetPresentation,
  statusPillKind,
} from "@/v2/datasetMeta";
import { libraryVerification } from "@/v2/libraryVerification";
import { RailFrame, RailStickyFooter } from "@/v2/RailFrame";

export function decisionFor(dataset) {
  const presentation = libraryAssetPresentation(dataset);
  const state = statusPillKind(dataset);
  if (presentation.kind === "scholarly_work" && state.kind === "registered") {
    return {
      headline: "Registered",
      body: "Retained as a reusable scholarly work in this Library. Source verification remains a separate claim.",
    };
  }
  if (presentation.kind === "operational" && state.kind === "registered") {
    return {
      headline: "Registered",
      body: "Retained as a reusable operational record; its current state must be judged from the recorded evidence.",
    };
  }
  return canIUseDecision(dataset);
}

function unknowns(dataset, fields, presentation) {
  const out = [];
  const demotion = demotionSentence(dataset);
  if (demotion) out.push(demotion);

  if (!fields.source && !dataset?.source && !dataset?.source_system && !dataset?.provenance) {
    out.push("Provenance not reported beyond registry");
  }

  if (presentation.kind === "scholarly_work") {
    if (!dataset?.doi && !dataset?.url) out.push("Stable identifier / source URL not reported");
    return out;
  }

  if (presentation.kind === "live_source") {
    if (!dataset?.collect_via && !dataset?.backend && !fields.access) out.push("Access route not reported");
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

function Fact({ label, value, mono = false }) {
  if (value == null || value === "") return null;
  return (
    <div className="rd-v2-library-inspector-fact">
      <span>{label}</span>
      <strong className={mono ? "mono" : undefined}>{value}</strong>
    </div>
  );
}

function sourceAuthorityLine(dataset, fields) {
  if (dataset?.self_provided || dataset?.upload) return "Self-provided";
  if (fields.source || dataset?.source || dataset?.source_system) {
    return fields.source || dataset.source || dataset.source_system;
  }
  if (dataset?.collect_via || dataset?.backend) return dataset.collect_via || dataset.backend;
  return "Source authority absent";
}

function askLabel(presentation, state) {
  if (state.kind === "query-ready") return "Ask about this →";
  if (presentation.kind === "scholarly_work") return "Ask about this work →";
  if (presentation.kind === "operational") return "Ask about this record →";
  return "Ask about access →";
}

/**
 * The centre workspace owns asset substance (table/schema, coverage, grain,
 * research use). The global situation strip owns selected-asset identity. The
 * rail is therefore purely decisional: usability, provenance authority,
 * verification, known boundaries, unresolved facts, and Ask.
 */
export function LibraryDatasetRailPanel({ dataset, previewOpen = false, onAskAbout }) {
  if (!dataset) return null;
  const fields = detailFields(dataset);
  const presentation = libraryAssetPresentation(dataset);
  const state = statusPillKind(dataset);
  const decision = decisionFor(dataset);
  const missing = unknowns(dataset, fields, presentation);
  const boundaries = knownBoundaries(dataset, fields);
  const updated = dataset.updated_at || dataset.last_modified || dataset.as_of;
  const route = dataset.collect_via || dataset.backend;
  const verification = libraryVerification(dataset);
  const remedy = hydrateRemedy(dataset);
  const archiveRef = String(dataset?.canonical_remote || dataset?.lineage?.canonical_remote || "").trim();

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
        <section className="rd-v2-library-inspector-block" aria-label="Source" data-testid="library-rail-source">
          <p className="rd-v2-rail-section-label">Source authority</p>
          <h3 className="rd-v2-library-rail-module-title">{sourceAuthorityLine(dataset, fields)}</h3>
          <div className="rd-v2-library-inspector-facts">
            <Fact label="Route" value={route} />
            <Fact label="Vault" value={fields.vault ? "Archived in Library" : "Local archive not confirmed"} />
            <Fact label="Updated" value={updated} />
          </div>
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
            <Fact label="Vault path" value={fields.vault} mono />
            <Fact label="Canonical archive" value={archiveRef || null} mono />
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
