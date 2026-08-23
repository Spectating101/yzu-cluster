import { EmptyRailState } from "@/v2/EmptyRailState";
import { historyEvidenceSummary, historyHoldingTruth } from "@/v2/discoverAdapters";
import { RailDecisionSummary, RailEntityHeader, RailField, RailFieldGrid, RailFrame, RailStickyFooter } from "@/v2/RailFrame";
import { historyLifecycleExplanation } from "@/v2/historyLifecycleLabel";
import { historyKnownUnknowns, NO_EVIDENCE_YET } from "@/v2/historyKnownUnknowns";

function text(value) {
  return String(value || "").replace(/_/g, " ").trim();
}

function historyState(event) {
  return historyLifecycleExplanation(event);
}

function pillTone(label) {
  const value = String(label || "");
  if (/needs recovery|blocked|failed/i.test(value)) return " fail";
  if (/approval required|needs you/i.test(value)) return " warn";
  return "";
}

function updatedAt(event) {
  const value = event?.ts || event?.updated_at || event?.created_at || "";
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function DiscoverHistoryRailPanel({ event, job, onAskAbout, onReviewRequest }) {
  if (!event) {
    return (
      <RailFrame>
        <div className="rd-v2-rail-scroll">
          <EmptyRailState
            title="No lifecycle item selected"
            hint="Select a request, schedule, failure, or registered result to inspect its durable state."
          />
        </div>
      </RailFrame>
    );
  }

  const state = historyState(event);
  const truth = historyHoldingTruth(event);
  const meta = event.meta || {};
  const title = event.target || event.title || event.id || "Discover request";
  const datasetId = truth.datasetId || meta.dataset_id || event.dataset_id || "";
  const source =
    datasetId ||
    truth.sourceId ||
    truth.candidateKey ||
    meta.source_id ||
    meta.candidate_key ||
    meta.intent_id ||
    "Durable Discover record";
  const requestId =
    datasetId || meta.intent_id || truth.jobId || meta.job_id || meta.subscription_id || event.id || "";
  const canReview = state.label === "Approval required" && Boolean(job?.id || meta.job_id || truth.jobId);
  const registered = state.label === "Registered" || state.label === "Query ready" || truth.registered;
  const libraryHref = datasetId ? `?tab=library&dataset=${encodeURIComponent(datasetId)}` : "";
  const risk = truth.receiptOnly
    ? "Receipt-only holding — do not treat as query-ready until catalog reconciliation completes."
    : state.risk;
  const evidence = historyKnownUnknowns(event, truth);

  return (
    <RailFrame>
      <RailEntityHeader
        id={requestId}
        title={title}
        pills={<span className={`rd-v2-pill${pillTone(state.label)}`}>{state.label}</span>}
        description={source}
      />
      <div className="rd-v2-rail-scroll">
        <div className="rd-v2-history-known-unknowns" data-testid="history-known-unknowns">
          {evidence.known.length ? (
            <section className="rd-v2-eval-block" aria-label="Known">
              <p className="rd-v2-eval-section-label">Known</p>
              <ul className="rd-v2-eval-checklist">
                {evidence.known.map((item) => (
                  <li key={item}>
                    <span className="rd-v2-eval-mark ok" aria-hidden="true">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {evidence.unknowns.length ? (
            <section className="rd-v2-eval-block" aria-label="Unknowns">
              <p className="rd-v2-eval-section-label">Unknowns</p>
              <ul className="rd-v2-eval-checklist">
                {evidence.unknowns.map((item) => (
                  <li key={item}>
                    <span className="rd-v2-eval-mark unknown" aria-hidden="true">?</span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {!evidence.hasEvidence ? (
            <p className="rd-v2-eval-prose muted">{NO_EVIDENCE_YET}</p>
          ) : null}
        </div>
        <RailDecisionSummary status={state.label} primary={state.explanation} risk={risk} next={state.next} />
        <RailFieldGrid>
          <RailField label="Latest durable update" value={updatedAt(event)} />
          <RailField label="Holding truth" value={truth.label} />
          <RailField label="Recorded event" value={text(event.kind || event.action || "discover")} />
          {historyEvidenceSummary(event) ? <RailField label="Evidence" value={historyEvidenceSummary(event)} /> : null}
          {meta.cadence || event.cadence ? <RailField label="Schedule" value={meta.cadence || event.cadence} /> : null}
          {meta.requested_schedule || event.requested_schedule ? (
            <RailField label="Requested cadence" value={meta.requested_schedule || event.requested_schedule} />
          ) : null}
          {meta.execution_mode ? <RailField label="Execution mode" value={text(meta.execution_mode)} /> : null}
        </RailFieldGrid>
        <details className="rd-v2-rail-technical">
          <summary>Technical record</summary>
          <RailFieldGrid>
            {datasetId ? <RailField label="Dataset" value={datasetId} mono /> : null}
            {truth.candidateKey ? <RailField label="Candidate" value={truth.candidateKey} mono /> : null}
            {truth.sourceId ? <RailField label="Source" value={truth.sourceId} mono /> : null}
            {truth.connectorId ? <RailField label="Connector" value={truth.connectorId} mono /> : null}
            {meta.registry_id || event.registry_id ? <RailField label="Registry" value={meta.registry_id || event.registry_id} mono /> : null}
            {meta.manifest_id || event.manifest_id ? <RailField label="Manifest" value={meta.manifest_id || event.manifest_id} mono /> : null}
            {meta.job_id || event.job_id ? <RailField label="Job" value={meta.job_id || event.job_id} mono /> : null}
          </RailFieldGrid>
        </details>
      </div>
      <RailStickyFooter>
        {canReview ? (
          <button type="button" className="rd-v2-btn sm primary" onClick={() => onReviewRequest?.(job || event)}>
            Review request
          </button>
        ) : null}
        {registered && libraryHref ? (
          <a className="rd-v2-btn sm primary" href={libraryHref}>
            Open in Library
          </a>
        ) : null}
        <button
          type="button"
          className="rd-v2-btn sm"
          onClick={() => onAskAbout?.({ ...event, title, kind: "discover_history" })}
        >
          Ask about this
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}
