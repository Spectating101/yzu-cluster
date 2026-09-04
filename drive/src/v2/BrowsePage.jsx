import { useEffect, useMemo, useRef, useState } from "react";
import { discoverSearch, discoverSources, webDiscover } from "@/v2/api";
import { sourcesResponseToRows } from "@/v2/discoverAdapters";
import { collectRouteLabel } from "@/v2/collectRouteLabel";
import { DiscoverHistoryPanel } from "@/v2/DiscoverHistoryPanel";
import { isDiscoverHistoryJob, jobToCandidateRow, pendingApprovalJobs } from "@/v2/procurementJobs";
import {
  classifyDiscoverResult,
  coverageLine,
  descriptiveLine,
  discoverCandidateState,
  exceptionalRowPill,
  humanizeDiscoverDescription,
  orderDiscoverResults,
  taxonomyMatchesFilter,
  taxonomyStageCounts,
} from "@/v2/browseMeta";
import { discoverCandidateUrl, webHitsToRows } from "@/v2/discoverActions";
import { candidateKey, isCandidateQueued, withCandidateKey } from "@/v2/candidateKey";
import { buildDiscoverLifecycle, projectDiscoverCandidateLifecycle } from "@/v2/discoverLifecycle";
import {
  interpretEvidenceNeed,
} from "@/v2/discoverComposition";
import { assessLocalSufficiency } from "@/v2/discoverSufficiency";
import { buildDiscoverRestingSummary } from "@/v2/discoverRestingSummary";
import { loadUserEmail } from "@/v2/deskSession";
import { discoverDemoSearch } from "@/v2/deskSeed";
import { DiscoverIntentWorkspace } from "@/v2/DiscoverIntentWorkspace";
import { DiscoverEvidenceBrief } from "@/v2/DiscoverEvidenceBrief";
import { handleEnterToRequestSubmit } from "@/v2/enterToSubmit";
import {
  candidateSpecificityText,
  hasSpecificDiscoverRoute,
} from "@/v2/discoverQuerySpecificity";
import { Chip, PageShell, SourceRibbon } from "@/v2/ui";
import { discoverTerritories } from "@/v2/discoverTerritories";
import { DiscoverCoveragePanel } from "@/v2/DiscoverCoveragePanel";
import { DiscoverEvidenceCockpit, DiscoverResearchRadar } from "@/v2/DiscoverCockpit";
import { DiscoverEvidenceField } from "@/v2/DiscoverEvidenceField";
import { DeskError } from "@/v2/DeskError";
import { resolveSurfaceLifecycle } from "@/v2/surfaceLifecycle";

const FILTERS = [
  { id: "all", label: "All results" },
  { id: "in_lab", label: "In your Library" },
  { id: "query_ready", label: "Query ready" },
  { id: "external", label: "Beyond your Library" },
  { id: "needs_access", label: "Needs access" },
];

function plural(value, singular, pluralValue = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralValue}`;
}

/** VC-5: first-use examples for the single adaptive composer. */
const DISCOVER_KEYWORD_EXAMPLE = "stablecoin";
const DISCOVER_QUESTION_EXAMPLE = "What data can I use to study de-pegs?";


function candidateTitle(row) {
  return row?.title || row?.name || row?.dataset_id || row?.doi || row?.url || "External dataset";
}

function offeringType(row, taxonomy) {
  const kind = String(row?.kind || row?.type || row?.artifact_type || "").toLowerCase();
  const url = String(row?.url || row?.source_url || row?.resolved_url || "").toLowerCase();
  const accessMode = String(row?.access_mode || row?.source_access_mode || row?.access_shape || "").toLowerCase();
  const status = String(row?.status || "").toLowerCase();
  if (taxonomy?.key?.startsWith("local-")) return "Library dataset";
  if (accessMode === "catalog_reference" || status === "example_reference") return "Reference only";
  if (/paper|article|literature|publication|openalex/.test(kind)) return "Reference only";
  if (/web|page|context/.test(kind)) return "Web context";
  if (/connector|api|bigquery|warehouse/.test(kind) || row?.connector) return "Connector";
  if (/artifact|file|download|csv|parquet|json/.test(kind) || /\.(csv|json|parquet|zip)(?:[?#]|$)/.test(url)) {
    return "Downloadable artifact";
  }
  return "Dataset";
}

function accessLabel(taxonomy) {
  switch (taxonomy?.key) {
    case "local-query-ready":
      return "In your Library · Query-ready declared";
    case "external-discoverable":
      return "Access not verified";
    case "external-probed":
      return "Probe observed";
    case "external-acquirable":
      return "Collection route declared";
    case "external-unavailable":
      return "No supported route";
    case "licensed-manual":
      return "Access review required";
    default:
      return taxonomy?.label || "State not recorded";
  }
}

function libraryFacingSufficiency(value) {
  return String(value || "")
    .replaceAll("Exact local match", "Exact Library match")
    .replaceAll("Partial local coverage", "Partial Library coverage")
    .replaceAll("Related lab asset", "Related Library asset")
    .replaceAll("No local alternative found", "No Library alternative found")
    .replaceAll("Local comparison unavailable", "Library comparison unavailable")
    .replaceAll("In lab", "In Library");
}

function hostLabel(value) {
  if (!value) return "";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function meaningfulQueryTerms(query) {
  return interpretEvidenceNeed(query).tokens
    .map((token) => String(token || "").toLowerCase())
    .filter((token) => token.length >= 3);
}

function candidateSearchText(row) {
  return candidateSpecificityText(row);
}

function hasSpecificSourceRoute(rows, query) {
  const backendMatched = (rows || []).some((row) => {
    // The federator may establish relevance semantically: a stablecoin query
    // can match an on-chain capability without repeating the literal word in
    // the provider name. Do not discard that measured backend verdict merely
    // because the presentational text has no lexical token overlap.
    if (Number(row?.query_relevance) > 0) return true;
    if (Array.isArray(row?.relevance_evidence) && row.relevance_evidence.length) return true;
    return Boolean(String(row?.match_mode || "").trim());
  });
  return backendMatched || hasSpecificDiscoverRoute(rows || [], interpretEvidenceNeed(query).tokens);
}

function rankExternalCatalogueRows(rows, query) {
  const terms = meaningfulQueryTerms(query);
  return [...(rows || [])].sort((left, right) => {
    const score = (row) => {
      const title = String(row?.title || "").toLowerCase();
      const text = candidateSearchText(row);
      return terms.reduce(
        (total, term) => total + (title.includes(term) ? 8 : 0) + (text.includes(term) ? 2 : 0),
        0,
      );
    };
    return score(right) - score(left);
  });
}

function DiscoverModeTabs({ mode = "explore", pendingCount = 0, onChange }) {
  const tabs = [
    { id: "explore", label: "Explore" },
    { id: "history", label: pendingCount ? `History · ${pendingCount}` : "History" },
  ];
  return (
    <div className="rd-v2-discover-modes" role="tablist" aria-label="Discover mode">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={mode === tab.id}
          className={mode === tab.id ? "on" : ""}
          onClick={() => onChange?.(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function DiscoverCandidateRow({
  row,
  labIds,
  selectedId,
  onSelectRow,
  onAdd,
  externalCatalogue = false,
}) {
  const taxonomy = row.discover_taxonomy || classifyDiscoverResult(row, labIds);
  const state = row.discover_state || discoverCandidateState(row, labIds);
  const selected = selectedId === candidateKey(row) || selectedId === row?.dataset_id;
  const ribbonSource =
    row.source || row.collect_via || row.source_route || row.publisher || row.backend || hostLabel(row.url);
  const taxonomyLine = accessLabel(taxonomy);
  const exceptionPill = exceptionalRowPill(row, taxonomy, state);
  const showSufficiency =
    !externalCatalogue && Number(taxonomy.group) >= 3 && row.discover_sufficiency?.browseLine;
  const hasExplicitDescription = Boolean(
    String(
      row?.description ||
        row?.recommended_use ||
        row?.subtitle ||
        row?.public_summary ||
        row?.notes ||
        "",
    ).trim(),
  );
  const evidenceLine = hasExplicitDescription ? humanizeDiscoverDescription(descriptiveLine(row)) : "";
  const coverage = coverageLine(row);
  const showCoverage = coverage && coverage !== "Coverage not described";
  const offeringFacts = [
    ["Type", offeringType(row, taxonomy)],
    ["Coverage", showCoverage ? coverage : null],
    ["Refresh", row?.refresh_frequency || row?.refresh || row?.update_frequency],
    ["Route", collectRouteLabel(row?.collect_via)
      ? `Collect via ${collectRouteLabel(row.collect_via)}`
      : null],
    ["Files", row?.file_summary || null],
    ["Observation", row?.probe_snapshot?.observed_at ? "Observed probe" : null],
  ].filter(([, value]) => Boolean(value));
  const canAdd = taxonomy.key === "external-acquirable"
    && !["Reference only", "Web context"].includes(offeringType(row, taxonomy))
    && typeof onAdd === "function";

  return (
    <li className={selected ? "rd-v2-row-on" : undefined}>
      <button
        type="button"
        className={`row rd-v2-discover-candidate${selected ? " selected" : ""}${exceptionPill ? " has-exception" : ""}`}
        data-kind={taxonomy.key}
        data-state={state.key}
        data-sufficiency={showSufficiency ? row.discover_sufficiency.state : undefined}
        aria-pressed={selected}
        onClick={() => onSelectRow(row)}
      >
        <span className="rd-v2-discover-candidate-source">
          <SourceRibbon source={ribbonSource} />
          {exceptionPill ? (
            <span className={`rd-v2-pill ${exceptionPill.className}`}>{exceptionPill.label}</span>
          ) : null}
        </span>
        <span className="rd-v2-discover-candidate-main">
          <span className="rd-v2-discover-candidate-heading">
            <strong className="rd-v2-discover-candidate-title">
              {selected ? (
                <span className="rd-v2-discover-selected-mark" aria-hidden="true">
                  ▌
                </span>
              ) : null}
              {candidateTitle(row)}
            </strong>
            <em className="rd-v2-discover-possession">{taxonomyLine}</em>
          </span>
          {evidenceLine ? <span className="rd-v2-discover-evidence">{evidenceLine}</span> : null}
          <span className="rd-v2-discover-offering-facts" aria-label="Offering facts">
            {offeringFacts.map(([label, value]) => (
              <span key={`${label}:${value}`}>
                <b>{label}</b>
                <em>{value}</em>
              </span>
            ))}
          </span>
          {showSufficiency ? (
            <span
              className={`rd-v2-discover-sufficiency rd-v2-discover-sufficiency-${row.discover_sufficiency.state}`}
              data-testid="discover-sufficiency-line"
            >
              {libraryFacingSufficiency(row.discover_sufficiency.browseLine)}
            </span>
          ) : null}
        </span>
      </button>
      {canAdd ? (
        <button
          type="button"
          className="rd-v2-discover-row-add"
          onClick={(event) => {
            event.stopPropagation();
            onAdd(row);
          }}
        >
          Add to collection
        </button>
      ) : null}
    </li>
  );
}

export function isDiscoverResearchQuestion(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.includes("?")) return true;
  if (/^(what|which|where|when|why|how|can|could|should|would|do|does|is|are|i need|we need|help me|find me)\b/i.test(text)) {
    return true;
  }
  return text.split(/\s+/).length >= 8;
}

function DiscoverQueryComposer({
  value,
  onValueChange,
  onSearch,
  onAsk,
  onAssess,
  idle = false,
}) {
  const submit = (event) => {
    event.preventDefault();
    const next = String(value || "").trim();
    if (!next) return;
    onSearch?.(next);
    if (isDiscoverResearchQuestion(next)) {
      // Assessment is deliberately started before Ask so the visible rail lands
      // on the continuing conversation while the hidden Detail lens evaluates.
      onAssess?.(next);
      onAsk?.(next);
    }
  };
  return (
    <form
      className={`rd-v2-discover-composer${idle ? " is-idle" : ""}`}
      data-testid="discover-query-composer"
      onSubmit={submit}
    >
      <textarea
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
        onKeyDown={handleEnterToRequestSubmit}
        rows={1}
        placeholder="Search datasets, or describe what data you need…"
        aria-label="Search or describe a research need"
      />
      <button type="submit" className="rd-v2-btn sm primary">
        Explore
      </button>
      <p>
        Keywords return fast results. A research question also starts a contextual Ask investigation automatically.
      </p>
      <div className="rd-v2-discover-composer-scope" aria-label="Discover search universe">
        <span>Library index</span>
        <span>Source catalogues</span>
        <span>Open web context</span>
        <span>URL / DOI inspection</span>
        <span>Approval-gated acquisition</span>
      </div>
      {/* VC-5: two compact examples teach the one-composer behaviour by
          demonstration. They are examples, not modes or tabs. */}
      {idle ? (
        <div className="rd-v2-discover-composer-examples" data-testid="discover-composer-examples">
          <button type="button" onClick={() => onValueChange?.(DISCOVER_KEYWORD_EXAMPLE)}>
            <span>Try a keyword</span>
            <em>{DISCOVER_KEYWORD_EXAMPLE}</em>
          </button>
          <button type="button" onClick={() => onValueChange?.(DISCOVER_QUESTION_EXAMPLE)}>
            <span>Ask a research need</span>
            <em>{DISCOVER_QUESTION_EXAMPLE}</em>
          </button>
        </div>
      ) : null}
    </form>
  );
}

function DiscoverLookupProgress({ progress, hasResults = false }) {
  const steps = [
    ["library", "Library evidence"],
    ["routes", "Known source routes"],
  ];
  return (
    <div
      className="rd-v2-discover-lookup-progress"
      data-testid="discover-lookup-progress"
      role="status"
      aria-live="polite"
    >
      <span className="rd-v2-discover-lookup-lead">
        {hasResults ? "Current evidence is visible" : "Building the evidence view"}
      </span>
      {steps.map(([id, label]) => {
        const state = progress?.[id] || "waiting";
        return (
          <span key={id} className={`is-${state}`}>
            <i aria-hidden="true">{state === "done" ? "✓" : state === "unavailable" ? "!" : ""}</i>
            {label} · {state === "done" ? "checked" : state === "unavailable" ? "unavailable" : "checking"}
          </span>
        );
      })}
    </div>
  );
}

function DiscoverRouteComparison({
  query,
  requirement,
  gap,
  rows,
  labIds,
  onSelectRow,
  onReviewAcquisition,
  onAsk,
  onSearchWider,
  onClose,
}) {
  const classified = rows.map((row) => ({
    row,
    taxonomy: row.discover_taxonomy || classifyDiscoverResult(row, labIds),
  }));
  const held = classified.find(({ taxonomy }) => taxonomy.key.startsWith("local-"))?.row;
  const publicRoute = classified.find(({ taxonomy }) =>
    ["external-acquirable", "external-probed", "external-discoverable"].includes(taxonomy.key),
  )?.row;
  const accessRoute = classified.find(({ taxonomy }) =>
    ["licensed-manual", "external-unavailable"].includes(taxonomy.key),
  )?.row;
  const readRequirement = (key, fallback = "Not yet specified") => {
    const item = requirement?.[key];
    const value = item?.value;
    if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
    return String(value || "").trim() || fallback;
  };
  const outputTitle = readRequirement("output_title", "Proposed research evidence dataset");
  const proposedUnit = readRequirement("unit");
  const proposedUniverse = readRequirement("universe/geography");
  const proposedPeriod = readRequirement("time_range");
  const proposedFields = readRequirement("fields");
  const recordedGap = String(
    gap?.blocks || gap?.statement || "the required evidence is not yet established",
  ).replace(/[.!?]+$/, "");
  const answerLine = [
    `Organizes ${proposedFields} at ${proposedUnit}`,
    proposedUniverse !== "Not yet specified" ? `for ${proposedUniverse}` : "",
    `to address the recorded gap: ${recordedGap}.`,
  ].filter(Boolean).join(" ");
  const nextAction = publicRoute
    ? {
        text: `Review the declared route for ${candidateTitle(publicRoute)} and verify coverage before approval.`,
        label: "Review acquisition route",
        run: () => onReviewAcquisition?.(publicRoute),
      }
    : accessRoute
      ? {
          text: `Review entitlement and permitted coverage for ${candidateTitle(accessRoute)} before choosing a route.`,
          label: "Review access route",
          run: () => onReviewAcquisition?.(accessRoute),
        }
      : {
          text: "Clarify the missing source and coverage constraints in Ask before recording implementation work.",
          label: "Refine in Ask",
          run: () => onAsk?.(
            `Refine a custom dataset strategy for: ${query}. The current gap is: ${gap?.statement || "not fully specified"}. Ask for the missing source and coverage constraints. Do not submit procurement.`,
          ),
        };
  const inputCards = [
    held ? {
      label: "Library evidence",
      title: candidateTitle(held),
      state: "Observed in Library",
      action: () => onSelectRow?.(held),
    } : {
      label: "Library evidence",
      title: "No Library input established",
      state: "Unknown",
    },
    publicRoute ? {
      label: "Source route",
      title: candidateTitle(publicRoute),
      state: publicRoute?.probe_snapshot?.observed_at ? "Probe observed" : "Route declared · verify",
      action: () => onReviewAcquisition?.(publicRoute),
    } : accessRoute ? {
      label: "Access route",
      title: candidateTitle(accessRoute),
      state: "Entitlement must be verified",
      action: () => onReviewAcquisition?.(accessRoute),
    } : {
      label: "Source route",
      title: "No supported route established",
      state: "Needs investigation",
    },
    {
      label: "Identity + coverage",
      title: proposedUniverse === "Not yet specified"
        ? "Identity and coverage contract"
        : `Coverage map · ${proposedUniverse}`,
      state: "Proposed · must verify",
    },
  ];

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="rd-v2-discover-route-scrim"
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <section
        className="rd-v2-discover-route-compare"
        data-testid="discover-route-comparison"
        role="dialog"
        aria-modal="true"
        aria-label="Ways to get this evidence"
      >
        <header>
          <div>
            <span className="rd-v2-eyebrow">Custom dataset strategy · proposed</span>
            <h3>{outputTitle}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close acquisition strategy">Close</button>
        </header>
        <p className="rd-v2-discover-route-intro">
          {gap?.statement || "The standard sourcing path does not yet establish every part of this evidence need."}
        </p>
        <section className="rd-v2-discover-strategy-answer">
          <span>How it answers the question</span>
          <p>{answerLine}</p>
        </section>
        <div className="rd-v2-discover-strategy-flow" aria-label="Proposed dataset strategy">
          <div className="rd-v2-discover-strategy-inputs">
            {inputCards.map((input) => (
              <button
                key={input.label}
                type="button"
                disabled={!input.action}
                onClick={input.action}
              >
                <span>{input.label}</span>
                <strong>{input.title}</strong>
                <em>{input.state}</em>
              </button>
            ))}
          </div>
          <div className="rd-v2-discover-strategy-arrow" aria-hidden="true">→</div>
          <div className="rd-v2-discover-strategy-process">
            <span>Proposed transform</span>
            <strong>Collect · normalize · reconcile</strong>
            <em>Implementation and source terms remain unverified</em>
          </div>
          <div className="rd-v2-discover-strategy-arrow" aria-hidden="true">→</div>
          <div className="rd-v2-discover-strategy-output">
            <span>Planned output</span>
            <strong>{outputTitle}</strong>
            <dl>
              <div><dt>Unit</dt><dd>{proposedUnit}</dd></div>
              <div><dt>Universe</dt><dd>{proposedUniverse}</dd></div>
              <div><dt>Period</dt><dd>{proposedPeriod}</dd></div>
              <div><dt>Fields</dt><dd>{proposedFields}</dd></div>
            </dl>
            <em>Register only after archive and query-readiness verification</em>
          </div>
        </div>
        <div className="rd-v2-discover-strategy-truth">
          <span><b>Observed</b> only states shown on source records</span>
          <span><b>Proposed</b> output contract and transformation</span>
          <span><b>Unknown</b> cost, completion time, full coverage, and feasibility</span>
        </div>
        <section className="rd-v2-discover-strategy-next">
          <div>
            <span>Next valid action</span>
            <p>{nextAction.text}</p>
          </div>
          <button type="button" onClick={nextAction.run}>{nextAction.label} →</button>
        </section>
        <footer>
          <p>This preview cannot submit procurement or promise delivery.</p>
          <button type="button" onClick={() => onAsk?.(
            `Refine a custom dataset strategy for: ${query}. The current gap is: ${gap?.statement || "not fully specified"}. Ask for the missing context and keep observed facts, proposals, and unknowns separate. Do not submit procurement.`,
          )}>
            Refine in Ask →
          </button>
          {!publicRoute && !accessRoute && onSearchWider ? (
            <button type="button" onClick={onSearchWider}>Search wider →</button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function DiscoverCandidateList({
  rows,
  labIds,
  selectedId,
  onSelectRow,
  onAdd,
  externalCatalogue = false,
}) {
  return (
    <ul className="rd-v2-catalog rd-v2-discover-candidates" aria-label="Discover candidates">
      {rows.map((row) => (
        <DiscoverCandidateRow
          key={candidateKey(row) || candidateTitle(row)}
          row={row}
          labIds={labIds}
          selectedId={selectedId}
          onSelectRow={onSelectRow}
          onAdd={onAdd}
          externalCatalogue={externalCatalogue}
        />
      ))}
    </ul>
  );
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const stamped = withCandidateKey(row);
    const key = candidateKey(stamped);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(stamped);
  }
  return out;
}


export function BrowsePage({
  labIds,
  libraryEvidenceCount,
  catalogLoading = false,
  partitions = [],
  shelves = [],
  loadError = "",
  onOpenLibraryResults,
  catalog = [],
  selectedId,
  onSelectRow,
  searchQuery,
  preferLiveSources = false,
  jobs = [],
  usingSeed = false,
  probeSnapshots = {},
  onSuggestSearch,
  onCraftUrl,
  onSearchWeb,
  onAskQuery,
  onReviewAcquisition,
  discoverMode = "explore",
  onDiscoverModeChange,
  discoverFocusAwaiting = false,
  historyEvents = [],
  historyJobsLoaded = false,
  historyJobsRefreshing = false,
  historyJobsRefreshFailed = false,
  selectedHistoryId = "",
  onSelectHistoryEvent,
  intentRecord = null,
  onIntentChange,
  onCloseIntent,
  onIntentSubmitted,
  onOpenIntentHistory,
  assessmentActive = false,
  assessmentResult = null,
  onOpenAssessment,
  onAssessmentChange,
  onAssessmentActive,
  resourcesRollup,
  resourcesError = "",
  deskHealth = null,
  synthesisHandoff = null,
  onReturnToSynthesis,
  onDismissSynthesisHandoff,
  onRestingSummary,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const [demoFallback, setDemoFallback] = useState(false);
  const [stateFilter, setStateFilter] = useState("all");
  const [indexMiss, setIndexMiss] = useState(false);
  const [externalSearchQuery, setExternalSearchQuery] = useState("");
  const [routeComparisonOpen, setRouteComparisonOpen] = useState(false);
  const [sortMode, setSortMode] = useState("relevance");
  const [queryDraft, setQueryDraft] = useState(searchQuery || "");
  const [loadedQuery, setLoadedQuery] = useState("");
  const [enrichedQuestion, setEnrichedQuestion] = useState("");
  const [autoWidening, setAutoWidening] = useState(false);
  const [lookupProgress, setLookupProgress] = useState({ library: "waiting", routes: "waiting" });
  const restoredSelectionRef = useRef("");

  const pendingRows = useMemo(
    () => pendingApprovalJobs(jobs).filter(isDiscoverHistoryJob).map((job) => jobToCandidateRow(job)).filter(Boolean),
    [jobs],
  );
  const isExplore = discoverMode === "explore" || discoverMode === "search";
  const showHistory = discoverMode === "history";

  useEffect(() => {
    setQueryDraft(searchQuery || "");
    setRouteComparisonOpen(false);
    setEnrichedQuestion("");
    setSortMode("relevance");
  }, [searchQuery]);

  useEffect(() => {
    if (!isExplore) return;
    if (!pendingRows.length) return;
    if (selectedId) return;
    if (!discoverFocusAwaiting) return;
    onSelectRow?.(pendingRows[0]);
  }, [isExplore, pendingRows, selectedId, onSelectRow, discoverFocusAwaiting]);

  useEffect(() => {
    let cancelled = false;
    const q = (searchQuery || "").trim();
    const externalSearchActive = Boolean(q && externalSearchQuery === q);
    // Widening is a refinement of the result set the researcher is already
    // reading. Preserve those measured rows while the live federation runs;
    // clearing them made the frozen counters falsely claim zero evidence.
    const isWidening = Boolean(preferLiveSources && q && loadedQuery === q);
    const email = loadUserEmail();
    const immediateDemo = discoverDemoSearch(q);
    setLoading(true);
    setError("");
    setSource("");
    setDemoFallback(false);
    setLookupProgress(
      q && !externalSearchActive && !preferLiveSources
        ? { library: "checking", routes: "checking" }
        : { library: "waiting", routes: "waiting" },
    );
    if (!isWidening) setRows([]);
    setStateFilter("all");
    setIndexMiss(false);
    setAutoWidening(false);
    if (!isWidening) setLoadedQuery("");

    const flattenRows = (data) => {
      const fromApi = (data.sections || []).flatMap((s) => s.rows || []);
      return fromApi.length ? fromApi : data.results || data.hits || [];
    };

    const apply = (data, label, { append = false } = {}) => {
      if (cancelled) return 0;
      const flat = flattenRows(data);
      setRows((current) => (append ? dedupeRows([...(current || []), ...flat]) : flat));
      setSource(label);
      if (label !== "demo") setDemoFallback(false);
      return flat.length;
    };

    const run = async () => {
      try {
        if (discoverMode === "history") {
          setRows([]);
          setSource("");
          setDemoFallback(false);
          setLoading(false);
          return;
        }
        if (!q) {
          try {
            const knownSources = await discoverSources("", {
              limit: 8,
              semantic: false,
              live: false,
            });
            apply({ results: sourcesResponseToRows(knownSources) }, "known_sources");
          } catch {
            setRows([]);
            setSource("");
            setDemoFallback(false);
          }
          return;
        }
        if (externalSearchActive) {
          const web = await webDiscover(q, 8);
          const webRows = rankExternalCatalogueRows(webHitsToRows(web), q);
          if (webRows.length) {
            apply({ sections: [{ id: "external_catalogues", rows: webRows }] }, "external_catalogues");
            setIndexMiss(Boolean(web.index_miss));
            return;
          }
          setIndexMiss(true);
          setRows([]);
          return;
        }
        // Two tempos, deliberately separated. A plain keyword lookup consults the
        // local holding index and the known-source route index in parallel. Neither
        // call fans out to remote providers. Semantic hybrid search and live
        // external adapters remain an explicit "Search wider" escalation.
        if (preferLiveSources) {
        try {
          const webPending = webDiscover(q, 8).catch(() => null);
          let sources = await discoverSources(q, {
            limit: 12,
            semantic: true,
            live: true,
          });
          let sourceRows = sourcesResponseToRows(sources);
          {
            // Web context is additive, not a fallback. It renders in its own
            // rail and is excluded from the ranked centre list, so fetching it
            // only when the route catalogue came up empty discarded the reading
            // a researcher wants alongside a real match. Both legs are in flight
            // together, so context costs no latency the route lookup was not
            // already spending.
            const web = await webPending;
            const webRows = web
              ? rankExternalCatalogueRows(webHitsToRows(web), q)
              : [];
            const merged = dedupeRows([...sourceRows, ...webRows]);
            if (merged.length) {
              const label = sources.demo
                ? "demo"
                : sourceRows.length
                  ? "sources"
                  : "external_catalogues";
              apply({ results: merged }, label, { append: isWidening });
              if (sources.demo) setDemoFallback(true);
              setIndexMiss(
                sourceRows.length ? false : Boolean(web && web.index_miss),
              );
              return;
            }
          }
        } catch {
          /* sources endpoint optional — fall through to the index path */
        }
        }
        // Paint each truthful source as soon as it answers. The Library index
        // is usually fast; waiting for the source-route catalogue made a real
        // local match disappear behind one generic spinner. Each partial paint
        // is additive, and the settled merge below remains the final authority.
        let discover = {};
        let knownSources = {};
        let discoverFailure = null;
        let knownSourcesFailure = null;
        await Promise.all([
          discoverSearch(q, 12, email)
            .then((data) => {
              discover = data || {};
              const partial = flattenRows(discover);
              if (partial.length) apply({ results: partial }, "index_local", { append: true });
              if (!cancelled) {
                setLookupProgress((current) => ({ ...current, library: "done" }));
              }
            })
            .catch((cause) => {
              discoverFailure = cause;
              if (!cancelled) {
                setLookupProgress((current) => ({ ...current, library: "unavailable" }));
              }
            }),
          discoverSources(q, { limit: 8, semantic: false, live: false })
            .then((data) => {
              knownSources = data || {};
              const partial = sourcesResponseToRows(knownSources);
              if (partial.length) apply({ results: partial }, "known_sources", { append: true });
              if (!cancelled) {
                setLookupProgress((current) => ({ ...current, routes: "done" }));
              }
            })
            .catch((cause) => {
              knownSourcesFailure = cause;
              if (!cancelled) {
                setLookupProgress((current) => ({ ...current, routes: "unavailable" }));
              }
            }),
        ]);
        if (discoverFailure && knownSourcesFailure) throw discoverFailure;
        const discoverRows = flattenRows(discover);
        const knownSourceRows = sourcesResponseToRows(knownSources);
        let mergedRows = dedupeRows([...knownSourceRows, ...discoverRows]);
        let label = mergedRows.length ? "index" : "";
        const weakOrMissingLibraryMatch = Boolean(discover.index_miss || discover.weak_match);

        const hasAcquireCandidate = mergedRows.some((r) => {
          const tax = classifyDiscoverResult(r, labIds);
          return !tax.key.startsWith("local-") && Boolean(discoverCandidateUrl(r));
        });

        // Open-web enrichment is another network hop. Keep it on the explicit
        // "Search wider" escalation; an index hit that lacks an acquire route is
        // still a truthful instant result, and the user can widen from there.
        if (preferLiveSources && mergedRows.length && !hasAcquireCandidate && q) {
          const web = await webDiscover(q, 8);
          const webRows = webHitsToRows(web);
          if (webRows.length) {
            mergedRows = dedupeRows([...mergedRows, ...webRows]);
            if (!label) label = "web";
          }
        }

        if (mergedRows.length) {
          apply({ sections: [{ id: label, rows: mergedRows }] }, label);
          // Semantic neighbours can be useful context without establishing that
          // the Library answers the request. Preserve those rows, but retain the
          // backend's weak-match signal so the progressive pass continues to
          // specific source routes instead of treating similarity as completion.
          setIndexMiss(weakOrMissingLibraryMatch);
          return;
        }

        if (immediateDemo.length) {
          apply({ sections: [{ id: "demo", rows: immediateDemo }] }, "demo");
          setIndexMiss(false);
          return;
        }

        if (preferLiveSources) {
          const web = await webDiscover(q, 8);
          const webRows = webHitsToRows(web);
          if (webRows.length) {
            apply({ sections: [{ id: "web", rows: webRows }] }, "web");
            setIndexMiss(false);
            return;
          }
        }

        setIndexMiss(weakOrMissingLibraryMatch);
        setRows([]);
      } catch (err) {
        if (cancelled) return;
        if (immediateDemo.length) {
          setRows(immediateDemo);
          setSource("demo");
          setDemoFallback(true);
          setError("");
        } else {
          setRows([]);
          setError("Catalog search unavailable. Check the query engine and retry.");
        }
      } finally {
        setLoading(false);
        setLoadedQuery(q);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [searchQuery, discoverMode, labIds, preferLiveSources, externalSearchQuery]);

  useEffect(() => {
    const q = String(searchQuery || "").trim();
    if (
      !isExplore
      || !q
      || loadedQuery !== q
      || preferLiveSources
      || externalSearchQuery === q
      || (!isDiscoverResearchQuestion(q) && !indexMiss)
      || enrichedQuestion === q
    ) return undefined;

    let cancelled = false;
    setAutoWidening(true);
    const enrich = async () => {
      try {
        let extra = [];
        try {
          const sources = await discoverSources(q, { limit: 12, semantic: true, live: true });
          extra = sourcesResponseToRows(sources);
        } catch {
          // The first result paint remains valid when optional enrichment is unavailable.
        }
        // Web context is fetched for every question, not only when the route
        // catalogue came up short. It renders in its own rail and is excluded
        // from the ranked centre list, so it competes with nothing; gating it
        // on "no specific route" meant a query that did match a route showed
        // "Web context - 0" while the endpoint held eight relevant sources.
        // The index-miss logic below already refuses to let a web hit stand in
        // for an offering, which is the property that gate was really guarding.
        try {
          const web = await webDiscover(q, 8);
          extra = dedupeRows([...extra, ...rankExternalCatalogueRows(webHitsToRows(web), q)]);
        } catch {
          // Web context is optional and must never erase already-rendered evidence.
        }
        if (cancelled || !extra.length) return;
        setRows((current) => dedupeRows([...current, ...extra]));
        setSource((current) => current ? `${current}+progressive` : "progressive");
        // A web/reference hit is useful context, but it does not repair an
        // index miss or create a dataset offering. Preserve the miss until the
        // wider pass returns at least one route the centre can actually show.
        const hasOffering = extra.some((row) => {
          const taxonomy = row.discover_taxonomy || classifyDiscoverResult(row, labIds);
          const type = offeringType(row, taxonomy);
          return type !== "Reference only" && type !== "Web context";
        });
        if (hasOffering) setIndexMiss(false);
      } finally {
        if (!cancelled) {
          // Mark completion only after the async pass settles. Setting this at
          // effect start changes a dependency, runs the cleanup immediately and
          // causes every eventual source result to be discarded as cancelled.
          setEnrichedQuestion(q);
          setAutoWidening(false);
        }
      }
    };
    enrich();
    return () => {
      cancelled = true;
    };
  }, [
    searchQuery,
    isExplore,
    loadedQuery,
    preferLiveSources,
    externalSearchQuery,
    enrichedQuestion,
    indexMiss,
  ]);

  const merged = useMemo(() => {
    const seen = new Set();
    const stampedRows = [];
    for (const r of rows) {
      const stamped = withCandidateKey(r);
      const key = candidateKey(stamped);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const queued = isCandidateQueued(stamped, jobs);
      const withProbe =
        probeSnapshots[key] && !stamped.probe_snapshot
          ? {
              ...stamped,
              probe_snapshot: {
                ...probeSnapshots[key],
                candidate_key: probeSnapshots[key].candidate_key || key,
              },
            }
          : stamped;
      const base = queued ? { ...withProbe, queued: true } : withProbe;
      const life = buildDiscoverLifecycle({
        row: base,
        jobs,
        catalog,
        labIds,
      });
      const projected = projectDiscoverCandidateLifecycle(base, life);
      const taxonomy = projected.discover_taxonomy || classifyDiscoverResult(projected, labIds);
      const sufficiency =
        Number(taxonomy.group) >= 3 ? assessLocalSufficiency(projected, catalog) : null;
      stampedRows.push({
        ...projected,
        discover_taxonomy: taxonomy,
        discover_sufficiency: sufficiency,
      });
    }
    return orderDiscoverResults(stampedRows, labIds);
  }, [rows, jobs, labIds, catalog, probeSnapshots]);

  const filtered = useMemo(() => {
    if (stateFilter === "all") return merged;
    return merged.filter((r) => {
      const tax = r.discover_taxonomy || classifyDiscoverResult(r, labIds);
      return taxonomyMatchesFilter(tax, stateFilter);
    });
  }, [merged, stateFilter, labIds]);

  // The frozen Explore composition has one ranked list.  Filters and sorting
  // change that list; they never promote a "best" row into a second surface.
  const renderedRows = useMemo(() => {
    if (sortMode !== "name") return filtered;
    return [...filtered].sort((left, right) => candidateTitle(left).localeCompare(candidateTitle(right)));
  }, [filtered, sortMode]);

  const interpretation = useMemo(() => interpretEvidenceNeed(searchQuery), [searchQuery]);

  const resultGroups = useMemo(() => {
    const groups = {
      available: [],
      external: [],
      held: [],
      context: [],
    };
    for (const row of filtered) {
      const taxonomy = row.discover_taxonomy || classifyDiscoverResult(row, labIds);
      const type = offeringType(row, taxonomy);
      if (taxonomy.key.startsWith("local-")) groups.held.push(row);
      else if (type === "Reference only" || type === "Web context") groups.context.push(row);
      else if (taxonomy.key === "external-acquirable") groups.available.push(row);
      else groups.external.push(row);
    }
    return groups;
  }, [filtered, labIds]);

  // Explore is a decision surface, not a dump of everything matching a word.
  // Keep held Library matches reachable through the control above, while the
  // centre list focuses on sources that can become a request.  A user-selected
  // filter still owns the list exactly, including Library results.
  const rankedOfferings = useMemo(
    () =>
      renderedRows.filter((row) => {
        const taxonomy = row.discover_taxonomy || classifyDiscoverResult(row, labIds);
        const type = offeringType(row, taxonomy);
        return !taxonomy.key.startsWith("local-") && type !== "Reference only" && type !== "Web context";
      }),
    [renderedRows, labIds],
  );
  const contextualRows = useMemo(
    () => renderedRows.filter((row) => {
      const taxonomy = row.discover_taxonomy || classifyDiscoverResult(row, labIds);
      return ["Reference only", "Web context"].includes(offeringType(row, taxonomy));
    }),
    [renderedRows, labIds],
  );
  const centreRows = stateFilter === "all" ? rankedOfferings : renderedRows;

  useEffect(() => {
    if (!isExplore || !selectedId || !centreRows.length) return;
    const exact = centreRows.find(
      (row) => candidateKey(row) === selectedId || row?.dataset_id === selectedId,
    );
    if (exact) {
      // URL hydration has the identity before App has a browseTarget. Bind the
      // resolved row once so Detail evaluates the same source the URL names.
      if (restoredSelectionRef.current !== selectedId) {
        restoredSelectionRef.current = selectedId;
        onSelectRow?.(exact);
      }
      return;
    }
    restoredSelectionRef.current = "";
    // A stale selection must not leave Detail judging an item that is no longer
    // in the ranked centre. Focus the first actual offering instead.
    onSelectRow?.(centreRows[0]);
  }, [isExplore, selectedId, centreRows, onSelectRow]);

  useEffect(() => {
    if (!selectedId) restoredSelectionRef.current = "";
  }, [selectedId]);

  useEffect(() => {
    if (!isExplore || !searchQuery.trim()) {
      onRestingSummary?.(null);
      return undefined;
    }
    onRestingSummary?.(
      buildDiscoverRestingSummary(rankedOfferings, labIds, searchQuery, {
        libraryEvidenceCount: resultGroups.held.length,
        contextCount: resultGroups.context.length,
      }),
    );
    return undefined;
  }, [isExplore, rankedOfferings, resultGroups.held.length, resultGroups.context.length, labIds, searchQuery, onRestingSummary]);

  useEffect(() => () => onRestingSummary?.(null), [onRestingSummary]);
  const resultBreakdown = useMemo(
    () => [
      resultGroups.available.length
        ? `${plural(resultGroups.available.length, "offering")} with a declared route`
        : null,
      resultGroups.external.length
        ? `${plural(resultGroups.external.length, "route")} to verify`
        : null,
      resultGroups.context.length
        ? plural(resultGroups.context.length, "reference")
        : null,
      resultGroups.held.length
        ? `${plural(resultGroups.held.length, "result")} in your Library`
        : null,
    ].filter(Boolean).join(" · "),
    [resultGroups],
  );

  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((item) => [
          item.id,
          item.id === "all"
            ? merged.length
            : merged.filter((row) => {
                const taxonomy = row.discover_taxonomy || classifyDiscoverResult(row, labIds);
                return taxonomyMatchesFilter(taxonomy, item.id);
              }).length,
        ]),
      ),
    [merged, labIds],
  );

  const stageCounts = useMemo(() => {
    const tax = taxonomyStageCounts(merged, labIds);
    return {
      ...tax,
      queued: merged.filter((r) => r.queued).length,
      acquirable: tax.acquirable,
    };
  }, [merged, labIds]);

  const q = (searchQuery || "").trim();
  const wideningInProgress = Boolean(preferLiveSources && q && loadedQuery === q);
  const allInLab =
    !loading && !autoWidening && merged.length > 0 && stageCounts.inLab > 0 && stageCounts.inLab === merged.length;
  const demoMode = demoFallback || (usingSeed && source === "demo");
  const activeFilter = FILTERS.find((item) => item.id === stateFilter) || FILTERS[0];
  const externalSearchActive = Boolean(q && externalSearchQuery === q);
  const externalCatalogueActive = externalSearchActive || source === "external_catalogues";
  const sourceRouteGap =
    !loading &&
    !autoWidening &&
    !externalSearchActive &&
    source === "sources" &&
    merged.length > 0 &&
    !hasSpecificSourceRoute(merged, q);
  const assessmentStatus = String(assessmentResult?.assessment_status || "").toLowerCase();
  const assessmentVerdict = String(assessmentResult?.verdict || "").toLowerCase();
  const hasEvidenceGap =
    assessmentStatus === "assessed"
    && ["partially_covered", "partial", "not_covered", "uncovered"].includes(assessmentVerdict)
    && assessmentResult?.gap;
  const strategyNeedsContext = ["insufficient_metadata", "insufficient_requirement", "cannot_assess"].includes(
    assessmentStatus,
  );
  const assessmentPending = Boolean(assessmentActive && !assessmentResult);
  const idleHoldings = useMemo(
    () => catalog.filter((row) => labIds.has(row.dataset_id || row.id)).slice(0, 4).map((row) => ({
      ...row,
      discover_taxonomy: classifyDiscoverResult(row, labIds),
    })),
    [catalog, labIds],
  );
  const idleRecommendations = useMemo(
    () => merged
      .filter((row) => !(row.discover_taxonomy || classifyDiscoverResult(row, labIds)).key.startsWith("local-"))
      .filter((row) => String(row.result_type || row.kind || "").toLowerCase() !== "connector")
      .slice(0, 4),
    [merged, labIds],
  );

  const exploreSurfaceState = resolveSurfaceLifecycle({
    idle: !q && !catalogLoading && !loadError,
    loading: q ? loading : catalogLoading,
    error: q ? error : loadError,
    count: q ? merged.length : catalog.length,
  });
  const historySurfaceState = resolveSurfaceLifecycle({
    loading: !historyJobsLoaded || historyJobsRefreshing,
    error: historyJobsRefreshFailed ? "History refresh failed" : "",
    count: historyEvents.length,
  });

  const modeTabs = (
    <DiscoverModeTabs
      mode={showHistory ? "history" : "explore"}
      pendingCount={pendingRows.length}
      onChange={onDiscoverModeChange}
    />
  );

  const filterMenu = (
    <details className="rd-v2-discover-filter-menu" data-testid="discover-filter-menu">
      <summary>
        <span>Filters</span>
        {stateFilter !== "all" ? <strong>{activeFilter.label}</strong> : null}
      </summary>
      <div className="rd-v2-discover-filter-popover" role="group" aria-label="Filter Discover results">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={stateFilter === item.id ? "on" : ""}
            aria-pressed={stateFilter === item.id}
            onClick={(event) => {
              setStateFilter(item.id);
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            <span>{item.label}</span>
            <b>{filterCounts[item.id] || 0}</b>
          </button>
        ))}
      </div>
    </details>
  );

  const sortMenu = (
    <details className="rd-v2-discover-filter-menu rd-v2-discover-sort-menu" data-testid="discover-sort-menu">
      <summary>
        <span>Sort</span>
        {sortMode === "name" ? <strong>Name A–Z</strong> : null}
      </summary>
      <div className="rd-v2-discover-filter-popover" role="group" aria-label="Sort Discover results">
        <button
          type="button"
          className={sortMode === "relevance" ? "on" : ""}
          aria-pressed={sortMode === "relevance"}
          onClick={(event) => {
            setSortMode("relevance");
            event.currentTarget.closest("details")?.removeAttribute("open");
          }}
        >
          <span>Relevance</span>
        </button>
        <button
          type="button"
          className={sortMode === "name" ? "on" : ""}
          aria-pressed={sortMode === "name"}
          onClick={(event) => {
            setSortMode("name");
            event.currentTarget.closest("details")?.removeAttribute("open");
          }}
        >
          <span>Name A–Z</span>
        </button>
      </div>
    </details>
  );

  const libraryEvidenceMenu = resultGroups.held.length ? (
    <details className="rd-v2-discover-library-evidence" data-testid="discover-library-evidence">
      <summary>Library evidence · {resultGroups.held.length}</summary>
      <div className="rd-v2-discover-library-popover">
        <span className="rd-v2-eyebrow">Relevant Library evidence</span>
        <DiscoverCandidateList
          rows={resultGroups.held.slice(0, 4)}
          labIds={labIds}
          selectedId={selectedId}
          onSelectRow={onSelectRow}
        />
        <div className="rd-v2-discover-library-actions">
          <button
            type="button"
            onClick={() => onAskQuery?.(
              `Compare what my Library already covers against these offerings for "${(searchQuery || "").trim()}" — name the gap, not just the overlap.`,
            )}
            disabled={!onAskQuery}
          >
            Compare coverage
          </button>
          <button type="button" onClick={() => onOpenLibraryResults?.()} disabled={!onOpenLibraryResults}>
            Open Library results
          </button>
        </div>
      </div>
    </details>
  ) : null;

  if (showHistory) {
    return (
      <PageShell
        className="rd-v2-discover-page rd-v2-discover-page--history"
        title="Discover"
        lead="Trace research questions to reusable evidence"
        headExtra={modeTabs}
        surfaceState={historySurfaceState}
      >
        <DiscoverHistoryPanel
          events={historyEvents}
          jobsLoaded={historyJobsLoaded}
          jobsRefreshing={historyJobsRefreshing}
          jobsRefreshFailed={historyJobsRefreshFailed}
          selectedId={selectedHistoryId}
          onSelectEvent={onSelectHistoryEvent}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      className="rd-v2-discover-page"
      title="Discover"
      lead="Find, compare, verify, and acquire research evidence"
      headExtra={modeTabs}
      toolbar={demoMode ? <Chip warn>Demo preview · static sample</Chip> : null}
      surfaceState={exploreSurfaceState}
    >
      {!q && loadError ? <DeskError raw={loadError} surface="Discover's Library index" /> : null}
      <div className="rd-v2-discover-browse" data-testid="discover-browse-mode" data-mode="browse">
        {synthesisHandoff ? (
          <section className="rd-v2-synthesis-handoff" data-testid="synthesis-discover-handoff" aria-label="Synthesis evidence handoff">
            <div>
              <span className="rd-v2-eyebrow">Synthesis evidence gap</span>
              <strong>{synthesisHandoff.field?.label || synthesisHandoff.field?.dataset_id || "Selected evidence"}</strong>
              <p>
                {synthesisHandoff.field?.role ? `${synthesisHandoff.field.role}. ` : ""}
                {synthesisHandoff.handoff?.required_grain ? `Required grain: ${synthesisHandoff.handoff.required_grain}. ` : ""}
                This is a research handoff only; no collection has started.
              </p>
            </div>
            <button type="button" className="rd-v2-btn sm" onClick={() => onReturnToSynthesis?.()}>
              Return to Synthesis
            </button>
            <button type="button" className="rd-v2-btn sm" onClick={() => onDismissSynthesisHandoff?.()}>
              Dismiss
            </button>
          </section>
        ) : null}
        {!q ? (
          <section className="rd-v2-discover-idle" data-testid="discover-empty">
            <DiscoverQueryComposer
              value={queryDraft}
              onValueChange={setQueryDraft}
              onSearch={onSuggestSearch}
              onAsk={(question) => onAskQuery?.(question, { kind: "investigation" })}
              onAssess={onOpenAssessment}
              idle
            />
            <DiscoverResearchRadar
              catalog={catalog}
              labIds={labIds}
              knownRows={idleRecommendations}
              jobs={jobs}
              partitions={partitions}
              shelves={shelves}
              resourcesRollup={resourcesRollup}
              onSearch={onSuggestSearch}
            />
            <div className="rd-v2-discover-idle-held">
              <DiscoverCoveragePanel catalog={catalog} partitions={partitions} shelves={shelves} onSearchShelf={
                onSuggestSearch ? (shelf) => onSuggestSearch(shelf.label.toLowerCase()) : undefined
              } />
              {/* VC-5: with no known routes this collapses to one quiet line
                  instead of an oversized empty section. */}
              {idleRecommendations.length ? (
                <>
                  <div className="rd-v2-home-section-head">
                    <div>
                      <span className="rd-v2-eyebrow">Curated beyond your Library</span>
                      <h3>Sources the desk already knows how to investigate</h3>
                    </div>
                    <span className="muted">{plural(merged.length, "known source route")}</span>
                  </div>
                  <DiscoverCandidateList
                    rows={idleRecommendations}
                    labIds={labIds}
                    selectedId={selectedId}
                    onSelectRow={onSelectRow}
                    onAdd={onReviewAcquisition}
                  />
                </>
              ) : (
                <p className="muted">
                  No curated source routes yet — search above, or paste a URL or DOI below.
                </p>
              )}
              {idleHoldings.length ? (
                <div className="rd-v2-discover-idle-library-note">
                  Library evidence · {plural(libraryEvidenceCount ?? labIds.size, "asset")}{" "}
                  {(libraryEvidenceCount ?? labIds.size) === 1 ? "is" : "are"} checked automatically after a research question.
                </div>
              ) : null}
            </div>
            {onCraftUrl ? (
              <form
                className="rd-v2-discover-idle-intake"
                data-testid="discover-craft-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const target = String(event.currentTarget.elements.sourceTarget?.value || "").trim();
                  if (target) onCraftUrl(target);
                }}
              >
                <label htmlFor="discover-idle-source-target">Have a URL or DOI?</label>
                <input id="discover-idle-source-target" name="sourceTarget" type="text" inputMode="url" placeholder="Paste a public URL or DOI" aria-label="Public URL or DOI" />
                <button type="submit">Inspect →</button>
              </form>
            ) : null}
          </section>
        ) : null}
        {q ? (
          <>
            <DiscoverEvidenceCockpit
              query={q}
              rows={merged}
              resultGroups={resultGroups}
              filterCounts={filterCounts}
              stateFilter={stateFilter}
              onFilterChange={setStateFilter}
              assessmentActive={assessmentActive}
              assessmentResult={assessmentResult}
              pendingCount={pendingRows.length}
              lookupProgress={lookupProgress}
              resourcesRollup={resourcesRollup}
              onSearchWider={onSearchWeb}
              onAssess={onOpenAssessment}
            />
            <section
              className="rd-v2-discover-explore-workspace"
              aria-label="Discover explore"
              data-testid="discover-result-summary"
            >
              <header className="rd-v2-discover-explore-need">
                <DiscoverQueryComposer
                  value={queryDraft}
                  onValueChange={setQueryDraft}
                  onSearch={onSuggestSearch}
                  onAsk={(question) => onAskQuery?.(question, { kind: "results", rows: merged })}
                  onAssess={onOpenAssessment}
                />
              </header>

              <div className="rd-v2-discover-query-tools">
                {interpretation.chips.length && !assessmentActive ? (
                  <div className="rd-v2-discover-interpreting" data-testid="discover-interpreting">
                    <span className="rd-v2-eyebrow">Research brief</span>
                  <div className="rd-v2-discover-interpreting-chips" role="list" aria-label="Interpreted evidence need">
                    {interpretation.chips.map((chip) => (
                      <span key={chip} role="listitem" className="rd-v2-discover-chip">
                        {chip}
                      </span>
                    ))}
                    {interpretation.overflow > 0 ? (
                      <span role="listitem" className="rd-v2-discover-chip muted">
                        +{interpretation.overflow}
                      </span>
                    ) : null}
                  </div>
                  <details className="rd-v2-discover-refine">
                    <summary>Refine evidence need</summary>
                    <div className="rd-v2-discover-refine-body">
                      <p>
                        <b>Research object</b> {interpretation.chips[0] || "—"}
                      </p>
                      <p>
                        <b>Evidence need</b> {q}
                      </p>
                      <p>
                        <b>Signals</b> {interpretation.tokens?.join(" · ") || interpretation.chips.join(" · ")}
                      </p>
                    </div>
                  </details>
                  </div>
                ) : null}
                <div className="rd-v2-discover-frozen-controls">
                  {filterMenu}
                  {sortMenu}
                </div>
              </div>
              <div className="rd-v2-discover-frozen-counts" aria-label="Discover result territories">
                {merged.length || !loading || wideningInProgress
                  ? discoverTerritories(resultGroups).map((territory) =>
                    // A page reload can begin a query before /datasets has
                    // answered. That is unmeasured, not zero held evidence.
                    territory.id === "held" && (catalogLoading || lookupProgress.library === "checking") ? (
                      <span key={territory.id}>Library evidence · Checking…</span>
                    // The freeze makes Library evidence an opener, not a label:
                    // it reveals a bounded preview plus Compare coverage and Open
                    // Library results. The popover existed and was never mounted.
                    ) : territory.id === "held" && libraryEvidenceMenu ? (
                      <span key={territory.id}>{libraryEvidenceMenu}</span>
                    ) : (
                      <span key={territory.id}>{territory.label} · {territory.count}</span>
                    ),
                  )
                  : null}
                {loading && !wideningInProgress ? (
                  <DiscoverLookupProgress progress={lookupProgress} hasResults={merged.length > 0} />
                ) : null}
                {loading && wideningInProgress ? (
                  <span className="rd-v2-discover-counts-loading" role="status">
                    Searching wider sources…
                  </span>
                ) : null}
                {!loading && autoWidening ? (
                  <span className="rd-v2-discover-counts-loading" role="status">
                    Checking broader sources…
                  </span>
                ) : null}
              </div>
              <div className="rd-v2-discover-result-actions" aria-label="Discover next actions">
                <div>
                  {autoWidening ? (
                    <>
                      <strong>Checking broader sources</strong>
                      <span>Related Library evidence remains visible while the desk looks for a direct route</span>
                    </>
                  ) : loading && centreRows.length === 0 ? (
                    <>
                      <strong>Checking sources</strong>
                      <span>{merged.length ? "Library evidence is already visible" : "Finding available routes"}</span>
                    </>
                  ) : !loading && centreRows.length === 0 ? (
                    <>
                      <strong>No offering found yet</strong>
                      <span>Search wider or refine the evidence need</span>
                    </>
                  ) : (
                    <>
                      <strong>{plural(centreRows.length, "offering")}</strong>
                      <span>
                        {stateFilter === "all"
                          ? resultBreakdown || "available to inspect"
                          : activeFilter.label}
                      </span>
                    </>
                  )}
                </div>
                <div>
                  {onSearchWeb ? (
                    <button type="button" onClick={() => onSearchWeb(q)}>
                      Search wider
                    </button>
                  ) : null}
                  {assessmentPending ? (
                    <button type="button" className="rd-v2-discover-strategy-trigger is-pending" disabled>
                      Assessing strategy…
                    </button>
                  ) : strategyNeedsContext ? (
                    <button
                      type="button"
                      className="rd-v2-discover-strategy-trigger"
                      onClick={() => onAskQuery?.(
                        q,
                        {
                          kind: "strategy_context",
                          rows: merged,
                          prompt: `Clarify the evidence requirement for: ${q}. Ask only for the missing context needed to judge coverage and prepare a custom dataset strategy. Do not submit procurement.`,
                        },
                      )}
                    >
                      Clarify evidence need
                    </button>
                  ) : hasEvidenceGap ? (
                    <button
                      type="button"
                      className="rd-v2-discover-strategy-trigger is-ready"
                      onClick={() => setRouteComparisonOpen(true)}
                    >
                      Review sourcing strategy
                    </button>
                  ) : null}
                </div>
              </div>

              <DiscoverEvidenceField
              query={q}
              candidateCount={centreRows.length}
              resultGroups={resultGroups}
              assessmentActive={assessmentActive}
              assessmentResult={assessmentResult}
              onReviewAssembly={hasEvidenceGap ? () => setRouteComparisonOpen(true) : undefined}
              onSearchWider={onSearchWeb}
            />

              {assessmentActive ? (
                <DiscoverEvidenceBrief
                  key={`assessment-workspace:${q}`}
                  variant="workspace"
                  initialQuestion={q}
                  autoAssess
                  assessmentValue={assessmentResult}
                  catalog={catalog}
                  onSelectRow={onSelectRow}
                  onLegacySearch={onSuggestSearch}
                  onCraftUrl={onCraftUrl}
                  onAssessmentChange={onAssessmentChange}
                  onAssessmentActive={onAssessmentActive}
                  resourcesRollup={resourcesRollup}
                  resourcesError={resourcesError}
                  deskHealth={deskHealth}
                />
              ) : null}

            </section>

            {centreRows.length ? (
              <section className="rd-v2-discover-ranked-results" aria-label="Ranked Discover results" data-testid="discover-ranked-results">
                <header className="rd-v2-discover-ranked-results-head">
                  <span className="rd-v2-eyebrow">Results</span>
                </header>
                <DiscoverCandidateList
                  rows={centreRows}
                  labIds={labIds}
                  selectedId={selectedId}
                  onSelectRow={onSelectRow}
                  onAdd={onReviewAcquisition}
                  externalCatalogue={externalCatalogueActive}
                />
              </section>
            ) : null}

            {stateFilter === "all" && contextualRows.length ? (
              <section
                className="rd-v2-discover-ranked-results rd-v2-discover-context-results"
                aria-label="References and web context"
                data-testid="discover-context-results"
              >
                <header className="rd-v2-discover-ranked-results-head">
                  <span className="rd-v2-eyebrow">References &amp; web context</span>
                  <strong>{plural(contextualRows.length, "item")} to inspect</strong>
                </header>
                <DiscoverCandidateList
                  rows={contextualRows}
                  labIds={labIds}
                  selectedId={selectedId}
                  onSelectRow={onSelectRow}
                  externalCatalogue={externalCatalogueActive}
                />
              </section>
            ) : null}

            {hasEvidenceGap && routeComparisonOpen ? (
              <DiscoverRouteComparison
                query={q}
                requirement={assessmentResult.requirement}
                gap={assessmentResult.gap}
                rows={merged}
                labIds={labIds}
                onSelectRow={onSelectRow}
                onReviewAcquisition={onReviewAcquisition}
                onAsk={(prompt) => onAskQuery?.(q, { kind: "implementation", prompt })}
                onSearchWider={() => onSearchWeb?.(q)}
                onClose={() => setRouteComparisonOpen(false)}
              />
            ) : null}

            {loading && wideningInProgress && filtered.length ? (
              <p className="rd-v2-browse-loading">Showing current matches while wider sources refresh…</p>
            ) : null}

            {!loading && allInLab ? (
              <div className="rd-v2-discover-expand-search">
                <div>
                  <strong>Every current match is already in your Library.</strong>
                  <span>Search wider only when you need alternatives or broader coverage.</span>
                </div>
              </div>
            ) : null}

            {!loading && error ? (
              <div className="rd-v2-discover-error">
                <p>{error}</p>
              </div>
            ) : null}

            {sourceRouteGap ? (
              <section className="rd-v2-discover-route-gap" aria-label="No specific source route match">
                <div>
                  <span className="rd-v2-eyebrow">No direct route match</span>
                  <strong>No current source route specifically matches “{q}”.</strong>
                  <p>The routes below are known to the desk, but they are not evidence results for this question.</p>
                </div>
                <button type="button" className="rd-v2-btn sm" onClick={() => setExternalSearchQuery(q)}>
                  Search external catalogues
                </button>
              </section>
            ) : null}

            {!loading && !error && centreRows.length === 0 ? (
              <div className="rd-v2-discover-miss">
                <p className="rd-v2-empty-inline">
                  No {stateFilter === "all" ? "" : `${activeFilter.label.toLowerCase()} `}matches for “{q}”
                  {indexMiss ? " in the current research index." : "."}
                </p>
              </div>
            ) : null}

            {centreRows.length ? (
              <footer className="rd-v2-discover-rank-foot" data-testid="discover-rank-foot">
                <span className="muted">
                  {externalCatalogueActive
                    ? "Ordered by title and description match to this question"
                    : `Ranked using active research + interpreted evidence need${stateFilter !== "all" ? ` · ${activeFilter.label}` : ""}`}
                </span>
              </footer>
            ) : null}

            <details className="rd-v2-discover-process-disclosure">
              <summary>How Discover handles a missing dataset</summary>
              <p>
                Discover checks the index first. Wider discovery is explicit; coverage assessment names one evidence
                gap; route comparison preserves unknowns; and any collection remains approval-gated before its
                verified output is registered in Library and recorded in History.
              </p>
            </details>
          </>
        ) : null}
      </div>
      {intentRecord ? (
        <div
          className="rd-v2-discover-intent-scrim"
          role="dialog"
          aria-modal="true"
          aria-label="Review acquisition"
          onMouseDown={(event) => event.target === event.currentTarget && onCloseIntent?.()}
        >
          <div className="rd-v2-discover-intent-modal">
            <DiscoverIntentWorkspace
              record={intentRecord}
              onChange={onIntentChange}
              onBack={onCloseIntent}
              onAsk={(record) => onAskQuery?.(
                record?.researchNeed || searchQuery,
                {
                  kind: "implementation",
                  prompt: `Investigate acquisition routes for ${record?.candidate?.title || "this offering"}. Intent ${record?.intent?.id || "is recorded"}. Explain only supported routes, required evidence, and unknowns. Do not submit procurement.`,
                },
              )}
              onSubmitted={onIntentSubmitted}
              onOpenHistory={onOpenIntentHistory}
              resourcesRollup={resourcesRollup}
              deskHealth={deskHealth}
            />
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
