import { useEffect, useMemo, useRef, useState } from "react";
import { assessDiscoverEvidence, listDiscoverGapRoutes } from "@/v2/api";
import { DISCOVER_SUGGESTIONS } from "@/v2/deskSeed";
import { handleEnterToRequestSubmit } from "@/v2/enterToSubmit";
import { buildDiscoverDecisionCapacity } from "@/v2/discoverDecisionCapacity";

const VERDICT_LABELS = {
  covered: "Covered",
  partially_covered: "Partially covered",
  partial: "Partially covered",
  not_covered: "Not covered",
  uncovered: "Not covered",
  // Backward compatibility for the short-lived fourth-verdict contract.
  cannot_assess: "Not yet recorded",
};
const ASSESSMENT_STATUS_LABELS = {
  insufficient_metadata: "Not yet recorded",
  insufficient_requirement: "Needs a brief",
};

function text(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || fallback;
  if (Array.isArray(value)) {
    const values = value.map((item) => text(item, "")).filter(Boolean);
    return values.join(" · ") || fallback;
  }
  if (typeof value === "object") {
    for (const key of ["value", "statement", "text", "label", "name", "reason"]) {
      if (value[key] != null && value[key] !== value) return text(value[key], fallback);
    }
    const values = Object.values(value)
      .filter((item) => typeof item === "string" || typeof item === "number")
      .map((item) => String(item).trim())
      .filter(Boolean);
    return values.join(" · ") || fallback;
  }
  return fallback;
}

const PROVENANCE = ["explicit", "drafted", "unspecified"];
const DIMENSION_LABELS = {
  unit: "Unit",
  "universe/geography": "Geography / universe",
  time_range: "Time range",
  frequency: "Frequency",
  fields: "Fields",
  event_type: "Event type",
};

function normalizeProvenance(value) {
  const raw = text(value, "").toLowerCase();
  if (raw.includes("explicit") || raw === "question") return "explicit";
  if (raw.includes("draft")) return "drafted";
  return "unspecified";
}

function normalizeRequirement(requirement) {
  const dimensions = Array.isArray(requirement?.dimensions) ? requirement.dimensions : [];
  const source = dimensions.length
    ? dimensions
    : Object.entries(requirement || {}).filter(([key]) => key !== "dimensions").map(([key, value]) =>
        typeof value === "object" && value != null
          ? { key, ...value }
          : { key, value },
      );
  return source.map((dimension, index) => ({
    key: text(dimension?.key, `dimension_${index + 1}`),
    label: text(
      dimension?.label,
      DIMENSION_LABELS[dimension?.key] || text(dimension?.key, "Requirement").replaceAll("_", " "),
    ),
    value: text(dimension?.value, "Unknown"),
    rawValue: dimension?.value,
    provenance: normalizeProvenance(dimension?.provenance),
  }));
}

function serializedDimensionValue(dimension) {
  const value = text(dimension?.value, "");
  if (!value || (value === "Unknown" && dimension?.provenance === "unspecified")) return null;
  if (text(dimension?.rawValue, "") === value) return dimension.rawValue;
  if (dimension?.key === "fields") {
    return value.split(/[,·]/).map((item) => item.trim()).filter(Boolean);
  }
  if (dimension?.key === "time_range") {
    const years = value.match(/\b(?:19|20)\d{2}\b/g) || [];
    if (years.length >= 2) return { start: years[0], end: years[1] };
  }
  return value;
}

function keyedRequirement(dimensions) {
  return (dimensions || []).reduce((requirement, dimension) => {
    requirement[dimension.key] = {
      label: dimension.label,
      value: serializedDimensionValue(dimension),
      provenance: normalizeProvenance(dimension.provenance),
    };
    return requirement;
  }, {});
}

function evidenceStateSummary(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return text(state, "Evidence state unknown");
  const parts = [
    text(state.materialization?.status ?? state.materialization, ""),
    text(state.access?.status ?? state.access?.value ?? state.access, ""),
    text(state.coverage?.status ?? state.coverage, ""),
  ]
    .map((item) => item.replaceAll("_", " "))
    .filter(Boolean);
  return [...new Set(parts)].join(" · ") || "Evidence state unknown";
}

function assessmentBasisSummary(basis) {
  if (!basis || typeof basis !== "object" || Array.isArray(basis)) {
    return text(basis, "Assessment basis incomplete");
  }
  const count = Number(basis.catalog_candidates_considered);
  const uncovered = Array.isArray(basis.uncovered_candidate_ids) ? basis.uncovered_candidate_ids : [];
  const parts = [
    Number.isFinite(count) ? `${count} held catalog record${count === 1 ? "" : "s"} considered` : "",
    text(basis.mode, "").replaceAll("_", " "),
    basis.assembly_status === "unknown" ? "assembly compatibility unknown" : "",
    // `cannot_assess` reports which specific candidates never declared coverage,
    // so this is a fixable data gap, not a dead end.
    uncovered.length
      ? `coverage never declared for ${uncovered.length} candidate${uncovered.length === 1 ? "" : "s"}: ${uncovered.slice(0, 5).join(", ")}${uncovered.length > 5 ? "…" : ""}`
      : "",
  ].filter(Boolean);
  return parts.join(" · ") || text(basis, "Assessment basis incomplete");
}

function evidenceCandidate(evidence) {
  return {
    dataset_id: evidence?.dataset_id || "",
    candidate_key: evidence?.dataset_id ? `dataset:${evidence.dataset_id}` : undefined,
    title: text(evidence?.title, "Library evidence record"),
    description: text(evidence?.contribution, "Contribution unknown"),
    limitations: text(evidence?.limitations, "Limitations unknown"),
    evidence_state: evidenceStateSummary(evidence?.evidence_state),
  };
}

function localSuggestions(catalog, question) {
  const terms = String(question || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 2);
  const ranked = [...(catalog || [])].sort((left, right) => {
    const score = (row) => {
      const haystack = [row?.name, row?.title, row?.dataset_id, row?.source, row?.coverage]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
    };
    return score(right) - score(left);
  });
  return ranked.slice(0, 2);
}

/** A compact, authoritative assessment path inside Explore. */
export function DiscoverEvidenceBrief({
  catalog = [],
  onSelectRow,
  onLegacySearch,
  onAssessmentActive,
  onCraftUrl,
  onAssessmentChange,
  onClose,
  initialQuestion = "",
  autoAssess = false,
  variant = "standalone",
  assessmentValue = null,
  resourcesRollup,
  resourcesError = "",
  deskHealth = null,
}) {
  const [draft, setDraft] = useState(initialQuestion);
  const [assessment, setAssessment] = useState(assessmentValue);
  const [dimensions, setDimensions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [routeResult, setRouteResult] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const autoStartedRef = useRef("");
  const routeAutoKeyRef = useRef("");
  const assessmentRequestSeqRef = useRef(0);
  const routeRequestSeqRef = useRef(0);
  // The workspace emits a fresh assessment to App so downstream decisions use
  // one authority. App then mirrors that exact object back as assessmentValue.
  // Distinguish that parent echo from a genuinely external replacement: an echo
  // must not invalidate the corrected route request that the same assessment
  // just started.
  const emittedAssessmentRef = useRef(null);

  useEffect(() => {
    setDimensions(normalizeRequirement(assessment?.requirement));
  }, [assessment]);

  useEffect(() => {
    if (initialQuestion) setDraft(initialQuestion);
  }, [initialQuestion]);

  useEffect(() => {
    if (!assessmentValue) return;
    if (assessmentValue === emittedAssessmentRef.current) {
      emittedAssessmentRef.current = null;
      return;
    }
    routeRequestSeqRef.current += 1;
    setRouteLoading(false);
    setAssessment(assessmentValue);
    setRouteResult(null);
    setRouteError("");
    routeAutoKeyRef.current = "";
  }, [assessmentValue]);

  const suggestions = useMemo(() => localSuggestions(catalog, draft), [catalog, draft]);
  const heldEvidence = Array.isArray(assessment?.held_evidence) ? assessment.held_evidence : [];
  const verdictKey = String(assessment?.verdict || "").trim().toLowerCase().replace(/[ -]/g, "_");
  const assessmentStatus = String(assessment?.assessment_status || "").trim().toLowerCase().replace(/[ -]/g, "_");
  const verdictLabel = ASSESSMENT_STATUS_LABELS[assessmentStatus]
    || VERDICT_LABELS[verdictKey]
    || text(assessment?.verdict, "Assessment pending");
  const verdictTone = assessmentStatus || verdictKey || "unknown";
  const establishedDimensions = dimensions.filter((item) => item.value && item.value !== "Unknown");
  const routeRows = Array.isArray(routeResult?.routes) ? routeResult.routes : [];
  const capacityRows = useMemo(
    () => buildDiscoverDecisionCapacity(resourcesRollup, deskHealth, { routes: routeRows }),
    [resourcesRollup, deskHealth, routeResult],
  );
  const resourcesRefreshFailed = Boolean(String(resourcesError || "").trim());
  // A failed /desk/resources read may still leave a thin /health projection in
  // App. Only surface rows whose underlying fields are actually present in that
  // surviving rollup; never turn omitted fleet/BigQuery telemetry into a false
  // "not configured" or generic availability claim.
  const partialCapacityRows = useMemo(() => {
    if (!resourcesRefreshFailed || !resourcesRollup || typeof resourcesRollup !== "object") return [];
    const usage = resourcesRollup.usage || {};
    const hero = resourcesRollup.hero || {};
    const metered = resourcesRollup.metered || {};
    const workers = hero.workers || {};
    const hasWorkers = [workers.available, workers.online, workers.idle, workers.ready, workers.total, workers.joined]
      .some((value) => value !== undefined && value !== null && value !== "");
    return capacityRows.filter((row) => {
      if (row.id === "vault") return Boolean(usage.vault || hero.vault);
      if (row.id === "cache") return Boolean(usage.cache);
      if (row.id === "bigquery") return Boolean(metered.bigquery);
      if (row.id === "fleet") return hasWorkers;
      return false;
    });
  }, [capacityRows, resourcesRefreshFailed, resourcesRollup]);
  const visibleCapacityRows = resourcesRefreshFailed ? partialCapacityRows : capacityRows;
  const capacityState = resourcesRollup === undefined
    ? "checking"
    : resourcesRefreshFailed
      ? (visibleCapacityRows.length ? "partial" : "unavailable")
      : resourcesRollup === null
        ? "unavailable"
        : visibleCapacityRows.length
          ? "measured"
          : "unreported";

  const requestAssessment = async ({ requirement, questionOverride } = {}) => {
    const question = String(questionOverride || draft).trim();
    if (!question) return;
    const assessmentRequestId = ++assessmentRequestSeqRef.current;
    // Any sourcing result belongs to the assessment that produced it. Retire
    // that authority synchronously before model work for a corrected brief.
    routeRequestSeqRef.current += 1;
    routeAutoKeyRef.current = "";
    setRouteResult(null);
    setRouteError("");
    setRouteLoading(false);
    emittedAssessmentRef.current = null;
    // A corrected brief immediately retires the prior evidence verdict. While
    // reassessment is running, the previous held-evidence judgment is historical
    // context, not current authority. Keep the investigation mounted but blank
    // its consequential assessment state until a fresh response establishes it.
    setAssessment(null);
    setDimensions([]);
    onAssessmentChange?.(null);
    onAssessmentActive?.(true);
    setLoading(true);
    setError("");
    try {
      const next = await assessDiscoverEvidence({ question, requirement });
      if (assessmentRequestId !== assessmentRequestSeqRef.current) return;
      emittedAssessmentRef.current = next;
      setAssessment(next);
      onAssessmentChange?.(next);
      onAssessmentActive?.(true);
    } catch (requestError) {
      if (assessmentRequestId !== assessmentRequestSeqRef.current) return;
      emittedAssessmentRef.current = null;
      // Failure establishes *absence of a current assessment*, not permission to
      // resurrect the previous verdict or collapse the investigation workspace.
      setAssessment(null);
      setDimensions([]);
      setError("Assessment is unavailable. Showing the catalogue instead.");
      onAssessmentChange?.(null);
      onAssessmentActive?.(true);
      // The workspace already retains the catalogue beneath the investigation.
      // Re-running the legacy search here would tear down the evidence position
      // and turn an assessment failure into a navigation/state-authority change.
      if (variant !== "workspace") onLegacySearch?.(question);
    } finally {
      if (assessmentRequestId === assessmentRequestSeqRef.current) setLoading(false);
    }
  };

  const requestRoutes = async () => {
    if (!assessment?.gap || assessment?.assessment_status !== "assessed" || routeLoading) return;
    const routeRequestId = ++routeRequestSeqRef.current;
    setRouteLoading(true);
    setRouteError("");
    try {
      const next = await listDiscoverGapRoutes({ question: assessment.question || draft, assessment });
      if (routeRequestId !== routeRequestSeqRef.current) return;
      setRouteResult(next || {});
    } catch (requestError) {
      if (routeRequestId !== routeRequestSeqRef.current) return;
      setRouteResult(null);
      setRouteError("Declared routes are unavailable. The gap remains unresolved.");
    } finally {
      if (routeRequestId === routeRequestSeqRef.current) setRouteLoading(false);
    }
  };

  useEffect(() => {
    const autoRouteKey = [assessment?.assessment_status, assessment?.question, assessment?.gap?.statement].filter(Boolean).join("|");
    if (variant !== "workspace" || assessment?.assessment_status !== "assessed" || !assessment?.gap || !autoRouteKey) return;
    if (routeAutoKeyRef.current === autoRouteKey) return;
    routeAutoKeyRef.current = autoRouteKey;
    requestRoutes();
    // One bounded route comparison per assessment identity; refresh remains explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, assessment?.assessment_status, assessment?.question, assessment?.gap?.statement]);

  useEffect(() => {
    const question = String(initialQuestion || "").trim();
    if (!autoAssess || !question || autoStartedRef.current === question) return;
    autoStartedRef.current = question;
    requestAssessment({ questionOverride: question });
    // One deliberate assessment per mounted query. Reassessment is explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAssess, initialQuestion]);

  const updateDimension = (index, field, value) => {
    setDimensions((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [field]: value } : item,
    ));
  };

  const requirementEditor = (
    <section className="rd-v2-evidence-requirement" aria-label="Editable evidence brief">
      <div className="rd-v2-evidence-section-head">
        <div><span className="rd-v2-eyebrow">Evidence brief</span><p>Edit only what the assessment should use on its next pass.</p></div>
        <button type="button" className="rd-v2-btn sm" disabled={loading} onClick={() => requestAssessment({ requirement: keyedRequirement(dimensions) })}>
          Apply & reassess
        </button>
      </div>
      {dimensions.length ? dimensions.map((dimension, index) => (
        <div className="rd-v2-evidence-dimension" key={dimension.key}>
          <label>{dimension.label}<input aria-label={`${dimension.label} value`} value={dimension.value} onChange={(event) => updateDimension(index, "value", event.target.value)} /></label>
          <label>Basis<select aria-label={`${dimension.label} provenance`} value={dimension.provenance} onChange={(event) => updateDimension(index, "provenance", event.target.value)}>{PROVENANCE.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </div>
      )) : <p className="muted">Requirement dimensions were not supplied.</p>}
    </section>
  );

  return (
    <section className={`rd-v2-evidence-brief is-${variant}`} aria-label="Evidence assessment" data-testid="discover-evidence-brief">
      {variant === "workspace" && !assessment ? (
        <div
          className={`rd-v2-evidence-workspace-pending${error ? " is-unavailable" : ""}`}
          data-state={error ? "unavailable" : loading ? "checking" : "unmeasured"}
          role="status"
        >
          <span className="rd-v2-eyebrow">Evidence position</span>
          <strong>{error ? "Assessment is unavailable" : "Checking the research need against held evidence…"}</strong>
          <p>
            {error
              ? "No current evidence verdict is established. Catalogue results remain visible; reassess before relying on held-evidence or sourcing claims."
              : "Search results stay available while coverage, gaps, and sourcing options are established."}
          </p>
        </div>
      ) : null}
      {variant === "standalone" ? <form
        className={`rd-v2-evidence-question${assessment ? " is-assessed" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          requestAssessment();
        }}
      >
        <label className="rd-v2-eyebrow" htmlFor="discover-assessment-question">Explore question</label>
        <div className="rd-v2-evidence-question-row">
          <textarea
            id="discover-assessment-question"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleEnterToRequestSubmit}
            rows={1}
            placeholder="State the evidence you need…"
            aria-label="Explore question"
          />
          <button type="submit" className="rd-v2-btn sm primary" disabled={!draft.trim() || loading}>
            {loading ? "Assessing…" : "Assess evidence"}
          </button>
        </div>
        <p className="rd-v2-ask-send-hint">Enter to assess · ⇧↵ newline</p>
      </form> : null}

      {!assessment ? (
        variant !== "standalone" ? null : <div className="rd-v2-evidence-suggestions" data-testid="discover-empty">
          <span className="rd-v2-eyebrow">Held locally</span>
          <h2>What evidence are you looking for?</h2>
          <p data-testid="discover-evidence-suggestions">Local context only while you type. An assessment runs when you submit.</p>
          {suggestions.length ? (
            <div className="rd-v2-evidence-suggestion-list">
              {suggestions.map((row) => (
                <button key={row.dataset_id || row.name} type="button" onClick={() => onSelectRow?.(row)}>
                  <strong>{text(row.name || row.title || row.dataset_id, "Local dataset")}</strong>
                  <span>{text(row.coverage || row.grain || row.source, "Metadata incomplete")}</span>
                </button>
              ))}
            </div>
          ) : <p className="muted">No local metadata is available yet.</p>}
          {DISCOVER_SUGGESTIONS.length ? (
            <div className="rd-v2-evidence-starters" aria-label="Suggested evidence needs">
              {DISCOVER_SUGGESTIONS.slice(0, 5).map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => setDraft(suggestion)}>{suggestion}</button>
              ))}
            </div>
          ) : null}
          {onCraftUrl ? (
            <form
              className="rd-v2-evidence-intake"
              data-testid="discover-craft-form"
              onSubmit={(event) => {
                event.preventDefault();
                const target = String(event.currentTarget.elements.sourceTarget?.value || "").trim();
                if (target) onCraftUrl(target);
              }}
            >
              <label htmlFor="discover-source-target">Have a URL or DOI?</label>
              <input
                id="discover-source-target"
                name="sourceTarget"
                type="text"
                inputMode="url"
                data-testid="discover-craft-url"
                placeholder="Paste a public URL or DOI"
                aria-label="Public URL or DOI"
              />
              <button type="submit">Inspect →</button>
            </form>
          ) : null}
        </div>
      ) : (
        <div className="rd-v2-evidence-assessment" data-testid="discover-assessment-result">
          <header className="rd-v2-evidence-assessment-head">
            <div>
              <span className="rd-v2-eyebrow">Held-evidence assessment</span>
              <h2>{text(assessment.question, draft)}</h2>
            </div>
            <span className={`rd-v2-evidence-verdict ${verdictTone}`} data-testid="discover-verdict">
              {verdictLabel}
            </span>
            {onClose ? <button type="button" className="rd-v2-evidence-close" onClick={onClose}>Hide assessment</button> : null}
          </header>
          <p className="rd-v2-evidence-because">{text(assessment.because, "Reasoning was not provided.")}</p>

          {variant === "workspace" ? (
            <section className="rd-v2-evidence-position-grid" aria-label="Evidence position summary">
              <div><span>Requirement</span><strong>{establishedDimensions.length}/{dimensions.length || 0}</strong><em>dimensions established</em></div>
              <div><span>Library support</span><strong>{heldEvidence.length}</strong><em>held evidence record{heldEvidence.length === 1 ? "" : "s"}</em></div>
              <div><span>Evidence gap</span><strong>{assessment.gap ? "Open" : "None reported"}</strong><em>{assessment.gap ? text(assessment.gap.statement, "Gap recorded") : "Assessment reported no remaining gap"}</em></div>
              <div><span>Sourcing</span><strong>{routeLoading ? "Checking" : routeRows.length ? `${routeRows.length} declared` : "Not established"}</strong><em>{routeRows.length ? "source options for the recorded gap" : "no route claim without a backend comparison"}</em></div>
            </section>
          ) : null}

          {(variant === "layered" || variant === "workspace") ? (
            <details className="rd-v2-evidence-edit">
              <summary>
                <span>{dimensions.filter((item) => item.value !== "Unknown").map((item) => `${item.label}: ${item.value}`).slice(0, 3).join(" · ") || "Requirement not yet specified"}</span>
                <b>Edit brief</b>
              </summary>
              {requirementEditor}
            </details>
          ) : requirementEditor}

          {variant !== "layered" ? <section className="rd-v2-evidence-held" aria-label="Library evidence">
            <div className="rd-v2-evidence-section-head"><div><span className="rd-v2-eyebrow">Library evidence</span><p>Select a record for existing Detail or Ask.</p></div></div>
            {heldEvidence.length ? (
              <ul data-testid="discover-held-evidence">
                {heldEvidence.map((evidence, index) => {
                  const candidate = evidenceCandidate(evidence);
                  return <li key={candidate.dataset_id || `${candidate.title}-${index}`}><button type="button" onClick={() => onSelectRow?.(candidate)}>
                    <strong>{candidate.title}</strong>
                    <span>{candidate.description}</span>
                    <em>{candidate.evidence_state} · {candidate.limitations}</em>
                  </button></li>;
                })}
              </ul>
            ) : <p className="muted">No Library evidence was returned. This does not establish that no evidence exists.</p>}
          </section> : null}

          <section className="rd-v2-evidence-gap" aria-label="Evidence gap" data-testid="discover-evidence-gap">
            <span className="rd-v2-eyebrow">One precise gap</span>
            {assessment.gap ? <>
              <strong>{text(assessment.gap.statement, "Gap statement unavailable")}</strong>
              <p>{text(assessment.gap.blocks, "What this blocks is unknown.")}</p>
              <p className="muted">Resolve with: {text(assessment.gap.resolution_evidence, "Evidence to resolve this is unknown.")}</p>
            </> : <p className="muted">No remaining gap was reported.</p>}
          </section>
          {assessment.assessment_status === "assessed" && assessment.gap ? (
            <section className="rd-v2-evidence-routes" aria-label="Declared acquisition routes">
              <div className="rd-v2-evidence-section-head">
                <div>
                  <span className="rd-v2-eyebrow">Declared ways to close the gap</span>
                  <p>Suggestions are source options, not a promise of collection or delivery.</p>
                </div>
                <button type="button" className="rd-v2-btn sm" disabled={routeLoading} onClick={requestRoutes}>
                  {routeLoading ? "Comparing declared sources…" : routeResult ? "Refresh declared routes" : "Find declared routes"}
                </button>
              </div>
              {routeError ? <p className="rd-v2-discover-error" role="status">{routeError}</p> : null}
              {routeResult ? (
                Array.isArray(routeResult.routes) && routeResult.routes.length ? (
                  <ul className="rd-v2-evidence-routes-list">
                    {routeResult.routes.map((route, index) => (
                      <li key={`${route.dimension || "gap"}-${route.source_id || index}`}>
                        <strong>{text(route.label, "Declared source")}</strong>
                        <span>{text(route.reason, "May address the recorded gap.")}</span>
                        <em>{[route.provider, text(route.access_mode, "").replaceAll("_", " "), route.action === "collect" ? "Collection can be requested for review" : "Access review is required"].filter(Boolean).join(" · ")}</em>
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">No declared route was found. This does not establish that no source exists.</p>
              ) : null}
            </section>
          ) : null}
          {variant === "workspace" ? (
            <section className="rd-v2-evidence-capacity" aria-label="Execution capacity" data-state={capacityState}>
              <div className="rd-v2-evidence-section-head">
                <div><span className="rd-v2-eyebrow">Execution capacity</span><p>Measured desk capability that can change the sourcing decision. No worker or quota is assigned here.</p></div>
              </div>
              {capacityState === "checking" ? (
                <p className="muted" role="status">Checking measured desk capacity…</p>
              ) : capacityState === "partial" ? (
                <>
                  <p className="muted">Full resource refresh failed. Showing only capacity facts still measured by the desk; do not infer missing compute, storage, or quota.</p>
                  <div className="rd-v2-evidence-capacity-grid">
                    {visibleCapacityRows.map((row) => (
                      <div key={row.id} className={row.attention ? "needs-attention" : ""}>
                        <span>{row.label}</span><strong>{row.metric}</strong>{row.detail ? <em>{row.detail}</em> : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : capacityState === "unavailable" ? (
                <p className="muted">Measured capacity is unavailable. Do not assume compute, storage, or quota from this sourcing view.</p>
              ) : visibleCapacityRows.length ? (
                <div className="rd-v2-evidence-capacity-grid">
                  {visibleCapacityRows.map((row) => (
                    <div key={row.id} className={row.attention ? "needs-attention" : ""}>
                      <span>{row.label}</span><strong>{row.metric}</strong>{row.detail ? <em>{row.detail}</em> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No decision-relevant measured capacity was reported.</p>
              )}
            </section>
          ) : null}
          {assessment.assessment_basis ? (
            <details className="rd-v2-evidence-basis-details">
              <summary>Assessment basis</summary>
              <p className="rd-v2-evidence-basis">{assessmentBasisSummary(assessment.assessment_basis)}</p>
            </details>
          ) : null}
        </div>
      )}
      {loading ? <p className="rd-v2-browse-loading" data-testid="discover-assessment-loading">Checking Library evidence against the brief…</p> : null}
      {error && variant !== "workspace" ? <p className="rd-v2-discover-error" role="status">{error}</p> : null}
    </section>
  );
}
