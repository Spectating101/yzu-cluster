import { canIUseDecision, demotionSentence, detailFields, displayName, hydrateRemedy, statusPillKind } from "@/v2/datasetMeta";
import { assetTypeLabel } from "@/v2/libraryEstate";
import { libraryVerification } from "@/v2/libraryVerification";
import { RailEntityHeader, RailFrame, RailStickyFooter } from "@/v2/RailFrame";
import { StatusPill } from "@/v2/StatusPill";

export function decisionFor(dataset) {
  return canIUseDecision(dataset);
}

function unknowns(dataset, fields) {
  const out = [];
  const demotion = demotionSentence(dataset);
  if (demotion) out.push(demotion);
  if (!dataset?.analysis_readiness) out.push("Readiness not reported by registry");
  if (!fields.coverage && !dataset?.coverage && !dataset?.date_range) out.push("Coverage not reported");
  if (!dataset?.grain) out.push("Grain not reported");
  if (!fields.source && !dataset?.source && !dataset?.source_system && !dataset?.provenance) {
    out.push("Provenance not reported beyond registry");
  }
  if (!dataset?.updated_at && !dataset?.last_modified && !dataset?.as_of) {
    out.push("Freshness / last refresh not described");
  }
  if (!fields.joinKeys?.length) out.push("Join keys / schema relationship not described");
  const limitations = dataset?.limitations || dataset?.caveats || fields.limitations;
  if (limitations) out.push(String(limitations).slice(0, 160));
  else out.push("Known caveats not described");
  return out;
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

/**
 * The centre workspace owns asset substance (table/schema, coverage, grain,
 * research use). The rail stays complementary: decision, provenance authority,
 * verification, unresolved facts, and Ask.
 */
export function LibraryDatasetRailPanel({ dataset, previewOpen = false, onAskAbout }) {
  if (!dataset) return null;
  const fields = detailFields(dataset);
  const state = statusPillKind(dataset);
  const decision = decisionFor(dataset);
  const missing = unknowns(dataset, fields);
  const updated = dataset.updated_at || dataset.last_modified || dataset.as_of;
  const route = dataset.collect_via || dataset.backend;
  const verification = libraryVerification(dataset);
  const remedy = hydrateRemedy(dataset);
  const archiveRef = String(dataset?.canonical_remote || dataset?.lineage?.canonical_remote || "").trim();

  return (
    <RailFrame>
      <RailEntityHeader
        title={displayName(dataset)}
        description={assetTypeLabel(dataset)}
        pills={<StatusPill dataset={dataset} />}
      />

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
            <Fact label="Dataset ID" value={dataset.dataset_id} mono />
            <Fact label="Registry readiness" value={dataset.analysis_readiness || "not declared"} mono />
            <Fact label="Backend" value={dataset.backend} mono />
            <Fact label="Vault path" value={fields.vault} mono />
            <Fact label="Canonical archive" value={archiveRef || null} mono />
            <Fact label="Query path" value={dataset.dataset_id ? `/query/${dataset.dataset_id}?limit=50` : null} mono />
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
          {state.kind === "query-ready" ? "Ask about this →" : "Ask about access →"}
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}
