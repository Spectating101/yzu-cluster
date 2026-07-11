/**
 * Discover Evaluation Surface body — shared by rail (legacy) and focused workspace.
 * Semantics stay in discoverEvaluation / discoverLifecycle; this is presentation only.
 */

import { applyLifecycleToEvaluation, LIFECYCLE } from "@/v2/discoverLifecycle";
import { buildDiscoverEvaluation } from "@/v2/discoverEvaluation";
import {
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";
import { EmptyRailState } from "@/v2/EmptyRailState";

const PATH_STAGES = [
  { id: "submitted", label: "Submitted" },
  { id: "approval", label: "Approval" },
  { id: "queue", label: "Queue" },
  { id: "running", label: "Running" },
  { id: "registered", label: "Registered" },
];

export function DiscoverEvaluationSurface({
  target,
  labIds,
  onAskAbout,
  onAddToLab,
  onPreviewExternal,
  onProbeSource,
  probeState,
  onOpenInLibrary,
  lifecycle = null,
  onTrackResources,
  onReviewApproval,
  onRetryLifecycleRefresh,
  variant = "rail",
}) {
  if (!target) {
    if (variant === "workspace") return null;
    return (
      <RailFrame>
        <div className="rd-v2-rail-scroll">
          <EmptyRailState
            title="No candidate selected"
            hint="Search, then select a candidate to evaluate what you can use and what remains unknown."
          />
        </div>
      </RailFrame>
    );
  }

  const evaluation = applyLifecycleToEvaluation(
    buildDiscoverEvaluation(target, labIds, probeState),
    lifecycle,
  );
  const probeLoading = evaluation.probeLoading;
  const submitting = lifecycle?.state === LIFECYCLE.SUBMITTING;
  const targetKey = target?.candidate_key || target?.dataset_id || target?.url || evaluation.title;

  const askPrompts = lifecycle
    ? [
        lifecycle.state === LIFECYCLE.APPROVAL_REQUIRED
          ? {
              id: "why_approval",
              label: "Why is this waiting for approval?",
              prompt: `Why is collection of ${evaluation.title} waiting for approval, and what happens after approval?`,
            }
          : null,
        lifecycle.state === LIFECYCLE.FAILED
          ? {
              id: "what_failed",
              label: "What failed?",
              prompt: `What failed while collecting ${evaluation.title}? Distinguish known errors from unknowns.`,
            }
          : null,
        lifecycle.state === LIFECYCLE.COMPLETED_UNREGISTERED ||
        lifecycle.state === LIFECYCLE.REGISTERED ||
        lifecycle.state === LIFECYCLE.QUERY_READY
          ? {
              id: "what_registered",
              label: "What will be registered?",
              prompt: `What was or will be registered from collecting ${evaluation.title}?`,
            }
          : null,
        {
          id: "can_use",
          label: "Can I use the output yet?",
          prompt: `Can I use the output of ${evaluation.title} yet? Distinguish registered vs query-ready honestly.`,
        },
      ].filter(Boolean)
    : [
        {
          id: "assess",
          label: "Assess this source",
          prompt: `Assess this Discover source: ${evaluation.title}. What is verified, what remains unknown, and what should I do next?`,
        },
        {
          id: "risks",
          label: "What are the main risks?",
          prompt: `What are the main risks of using or acquiring ${evaluation.title}? Distinguish verified facts from unknowns.`,
        },
        {
          id: "compare",
          label: "Compare with lab holdings",
          prompt: `Compare ${evaluation.title} with my current lab holdings. Note overlaps and gaps without inventing coverage.`,
        },
        {
          id: "probe_next",
          label: "What should I probe next?",
          prompt: `Given ${evaluation.title}, what should I probe next, and what would still remain unknown after a successful probe?`,
        },
      ];

  const primary = lifecycle?.primaryAction || evaluation.actions.primary;
  const secondary = lifecycle ? lifecycle.secondaryActions || [] : evaluation.actions.secondary;

  const runAction = (id) => {
    if (id === "open_library" || id === "inspect_record") {
      const datasetId = lifecycle?.registeredDatasetId || target?.dataset_id;
      onOpenInLibrary?.(datasetId ? { ...target, dataset_id: datasetId } : target);
    } else if (id === "add_lab") onAddToLab?.(target);
    else if (id === "probe") onProbeSource?.(target);
    else if (id === "preview") onPreviewExternal?.();
    else if (id === "review_approval") onReviewApproval?.(lifecycle?.job || target);
    else if (id === "track_resources") onTrackResources?.(lifecycle?.job || target);
    else if (id === "ask" || id === "review_access") onAskAbout?.(target);
  };

  const reachedStages = new Set(lifecycle?.stages || []);
  const shellClass =
    variant === "workspace"
      ? "rd-v2-eval-workspace"
      : "rd-v2-eval-rail";

  const body = (
    <>
      <div
        className={`rd-v2-eval-surface ${shellClass}`}
        data-testid="discover-eval-surface"
        data-variant={variant}
        data-taxonomy={evaluation.taxonomyKey}
        data-lifecycle={lifecycle?.state || ""}
        data-selected-title={evaluation.title}
      >
        <header className="rd-v2-eval-identity">
          <p className="rd-v2-eval-kicker">Selected candidate</p>
          <h2 className="rd-v2-eval-title">{evaluation.title}</h2>
          <p className="rd-v2-eval-source">
            {evaluation.sourceLine}
            <span aria-hidden="true"> · </span>
            {evaluation.taxonomyLabel}
          </p>
        </header>

        <section className="rd-v2-eval-decision" aria-label="Can I use this">
          <p className="rd-v2-eval-section-label">Can I use this?</p>
          <p className="rd-v2-eval-decision-headline">{evaluation.decision.headline}</p>
          <p className="rd-v2-eval-decision-body">{evaluation.decision.body}</p>
        </section>

        {lifecycle ? (
          <section
            className={`rd-v2-eval-lifecycle rd-v2-eval-lifecycle-${lifecycle.state}`}
            aria-label="Collection status"
            data-testid="discover-lifecycle"
          >
            <p className="rd-v2-eval-section-label">Collection status</p>
            <p className="rd-v2-eval-decision-headline">{lifecycle.label}</p>
            <p className="rd-v2-eval-decision-body">{lifecycle.explanation}</p>
            {lifecycle.refreshFailed ? (
              <p className="rd-v2-eval-lifecycle-warn">
                Status refresh failed · showing last known state{" "}
                <button type="button" className="rd-v2-linkish" onClick={() => onRetryLifecycleRefresh?.()}>
                  Retry
                </button>
              </p>
            ) : null}
            {lifecycle.evidence?.length ? (
              <ul className="rd-v2-eval-lifecycle-evidence">
                {lifecycle.evidence.map((item) => (
                  <li key={`${item.label}-${item.value}`}>
                    <b>{item.label}</b> {item.value}
                  </li>
                ))}
              </ul>
            ) : null}
            <ol className="rd-v2-eval-lifecycle-path" aria-label="Lifecycle path">
              {PATH_STAGES.map((stage) => (
                <li
                  key={stage.id}
                  className={`${reachedStages.has(stage.id) ? "on" : ""}${
                    lifecycle.state === LIFECYCLE.FAILED &&
                    stage.id === "running" &&
                    reachedStages.has("failed")
                      ? " failed"
                      : ""
                  }`}
                  data-stage={stage.id}
                  data-reached={reachedStages.has(stage.id) ? "true" : "false"}
                >
                  {stage.label}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <div className="rd-v2-rail-scroll rd-v2-eval-scroll">
          <section className="rd-v2-eval-block" aria-label="Useful for">
            <p className="rd-v2-eval-section-label">Useful for</p>
            <p className="rd-v2-eval-prose">{evaluation.usefulFor}</p>
          </section>

          {evaluation.coverage.length ? (
            <section className="rd-v2-eval-block" aria-label="Coverage">
              <p className="rd-v2-eval-section-label">Coverage</p>
              <ul className="rd-v2-eval-list">
                {evaluation.coverage.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="rd-v2-eval-block" aria-label="Coverage">
              <p className="rd-v2-eval-section-label">Coverage</p>
              <p className="rd-v2-eval-prose muted">Coverage not described</p>
            </section>
          )}

          <div className="rd-v2-eval-evidence-grid">
            {evaluation.hasProbe && evaluation.verified.length ? (
              <section className="rd-v2-eval-block rd-v2-eval-verified" aria-label="Verified">
                <p className="rd-v2-eval-section-label">Verified</p>
                <ul className="rd-v2-eval-checklist">
                  {evaluation.verified.map((item) => (
                    <li key={item}>
                      <span className="rd-v2-eval-mark ok" aria-hidden="true">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="rd-v2-eval-block rd-v2-eval-unknown" aria-label="Still unknown">
              <p className="rd-v2-eval-section-label">Still unknown</p>
              <ul className="rd-v2-eval-checklist">
                {evaluation.unknowns.map((item) => (
                  <li key={item}>
                    <span className="rd-v2-eval-mark unknown" aria-hidden="true">
                      ?
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {evaluation.inferred.length ? (
            <section className="rd-v2-eval-block rd-v2-eval-inferred" aria-label="Inferred">
              <p className="rd-v2-eval-section-label">Inferred</p>
              <ul className="rd-v2-eval-checklist">
                {evaluation.inferred.map((item) => (
                  <li key={item}>
                    <span className="rd-v2-eval-mark infer" aria-hidden="true">
                      ~
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {evaluation.probeError ? (
            <p className="rd-v2-discover-probe-error">{evaluation.probeError}</p>
          ) : null}

          {evaluation.technical.length || evaluation.modelNotes.length ? (
            <details key={targetKey} className="rd-v2-eval-tech">
              <summary>Technical evidence</summary>
              <div className="rd-v2-eval-tech-body">
                {evaluation.modelNotes.map((note) => (
                  <p key={note.label} className="rd-v2-eval-model-note">
                    <span className="rd-v2-eval-section-label">Model interpretation</span>
                    {note.detail || note.label}
                  </p>
                ))}
                <RailFieldGrid>
                  {evaluation.technical.map((fact) => (
                    <RailField
                      key={`${fact.label}-${fact.detail}`}
                      label={fact.label}
                      value={fact.detail || "—"}
                      mono={/url|etag|connector/i.test(fact.label)}
                    />
                  ))}
                </RailFieldGrid>
              </div>
            </details>
          ) : (
            <details key={targetKey} className="rd-v2-eval-tech">
              <summary>Technical evidence</summary>
              <p className="rd-v2-eval-prose muted">
                No probe evidence yet. Probe the source to collect endpoint facts.
              </p>
            </details>
          )}

          <div className="rd-v2-eval-ask-chips" aria-label="Ask about this source">
            <p className="rd-v2-eval-section-label">Ask about this source</p>
            <div className="rd-v2-chips-row">
              {askPrompts.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className="rd-v2-chip clickable"
                  onClick={() => onAskAbout?.(target, chip.prompt)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div data-testid="discover-eval-actions">
        <RailStickyFooter>
          {primary ? (
            <button
              type="button"
              className="rd-v2-btn primary sm"
              disabled={submitting || (probeLoading && primary.id === "probe")}
              onClick={() => runAction(primary.id)}
            >
              {submitting
                ? "Submitting…"
                : probeLoading && primary.id === "probe"
                  ? "Probing…"
                  : primary.label}
            </button>
          ) : null}
          {secondary.map((action) => (
            <button
              key={action.id}
              type="button"
              className="rd-v2-btn sm"
              disabled={submitting || (probeLoading && action.id === "probe")}
              onClick={() => runAction(action.id)}
            >
              {probeLoading && action.id === "probe" ? "Probing…" : action.label}
            </button>
          ))}
        </RailStickyFooter>
      </div>
    </>
  );

  if (variant === "workspace") {
    return <div className="rd-v2-eval-workspace-shell">{body}</div>;
  }

  return <RailFrame>{body}</RailFrame>;
}
