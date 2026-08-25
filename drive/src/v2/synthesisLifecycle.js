/**
 * Synthesis lifecycle truth labels and journey authority.
 *
 * These keep the Synthesis state distinctions honest:
 *
 *   objective != evidence mapped != method specified != proposal reviewed
 *   accepted method != execution ready != researcher approval != approved execution
 *   completed worker != archive verified != registered != query-ready
 *
 * The durable thread is authoritative. A browser route may inspect a page the
 * thread has already earned, but it may never unlock a future page on its own.
 */

function text(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function normalizeStatus(status) {
  return text(status).toLowerCase().replace(/-/g, "_");
}

/** Lifecycle states that can only be reached after researcher approval. */
export const POST_APPROVAL_STATUSES = [
  "queued",
  "running",
  "registering",
  "archiving",
  "registered",
  "query_ready",
  "completed",
  "failed",
];

/**
 * Pages in the researcher journey. These are product pages, not worker stages:
 * a worker may complete while the researcher remains on Build until archive /
 * registry proof earns Result.
 */
export const SYNTHESIS_JOURNEY_STAGES = [
  { id: "objective", label: "Objective", detail: "Define the research object" },
  { id: "evidence", label: "Evidence", detail: "Choose held Library inputs" },
  { id: "specification", label: "Specification", detail: "Resolve material construction choices" },
  { id: "proposal", label: "Proposal", detail: "Review the exact proposed revision" },
  { id: "readiness", label: "Readiness", detail: "Verify the accepted execution specification" },
  { id: "approval", label: "Approval", detail: "Authorize the exact queued execution" },
  { id: "build", label: "Build", detail: "Follow execution and registration proof" },
  { id: "result", label: "Result", detail: "Inspect the registered Library asset" },
];

const JOURNEY_INDEX = Object.fromEntries(SYNTHESIS_JOURNEY_STAGES.map((stage, index) => [stage.id, index]));

function hasEvidenceNodes(thread) {
  const nodes = thread?.state?.nodes;
  return Array.isArray(nodes) && nodes.some(
    (node) => node?.layer === "evidence" || node?.type === "source" || node?.type === "construct",
  );
}

function hasRecommendedConstruction(thread) {
  const constructions = thread?.state?.constructions;
  return Array.isArray(constructions) && constructions.some((construction) => construction?.recommended === true);
}

/**
 * The current working page is earned only by persisted thread truth.
 *
 * `spec_accepted` is intentionally Readiness: the method revision exists, but
 * no execution request has been submitted. `completed` remains Build because a
 * finished worker has not yet established archive / registry promotion.
 *
 * A persisted recommended construction is Specification work even before it is
 * accepted. The centre already exposes that recommendation as a material method
 * decision, so the shared lifecycle authority must not leave the rail behind on
 * Evidence merely because the recommendation has not yet been copied into the
 * evidence map or proposal record.
 */
export function synthesisJourneyStage(thread) {
  if (!thread?.id) return "objective";
  const state = thread.state || {};
  const status = normalizeStatus(state.execution?.status);

  if (["registered", "query_ready"].includes(status)) return "result";
  if (["queued", "running", "registering", "archiving", "completed", "failed"].includes(status)) return "build";
  if (status === "pending_approval") return "approval";
  if (status === "spec_accepted" || (state.execution_spec && !status)) return "readiness";
  if (state.proposal) return "proposal";
  if (hasRecommendedConstruction(thread) || hasEvidenceNodes(thread)) return "specification";
  return "evidence";
}

/**
 * Return the complete navigation model for one durable thread.
 * Past pages remain inspectable; future pages remain locked. The current page
 * is never inferred from URL state or a browser-local progress counter.
 */
export function synthesisJourney(thread) {
  const current = synthesisJourneyStage(thread);
  const currentIndex = JOURNEY_INDEX[current] ?? 0;
  return {
    current,
    currentIndex,
    stages: SYNTHESIS_JOURNEY_STAGES.map((stage, index) => ({
      ...stage,
      index,
      state: index < currentIndex ? "done" : index === currentIndex ? "current" : "locked",
      inspectable: index <= currentIndex,
      locked: index > currentIndex,
    })),
  };
}

/**
 * Resolve a requested page without allowing deep links to advance authority.
 * Unknown/future requests collapse to the current earned page; past pages are
 * allowed as read-only inspection targets.
 */
export function resolveSynthesisJourneyStage(thread, requestedStage = "") {
  const journey = synthesisJourney(thread);
  const requested = text(requestedStage).toLowerCase();
  const requestedIndex = JOURNEY_INDEX[requested];
  if (!Number.isInteger(requestedIndex) || requestedIndex > journey.currentIndex) {
    return journey.current;
  }
  return requested;
}

/** Human-readable reason a future stage is locked. */
export function synthesisStageLockReason(thread, stageId) {
  const journey = synthesisJourney(thread);
  const stage = journey.stages.find((item) => item.id === stageId);
  if (!stage?.locked) return "";
  switch (stageId) {
    case "evidence":
      return "Create the durable research object first.";
    case "specification":
      return "Review and attach held Library evidence first.";
    case "proposal":
      return "Resolve the current construction choices before a proposal can be reviewed.";
    case "readiness":
      return "Accept an exact proposal revision before checking execution readiness.";
    case "approval":
      return "Submit the accepted execution specification for researcher approval first.";
    case "build":
      return "Approve the exact execution request before a worker may run.";
    case "result":
      return "A worker result must be verified and registered before Result is available.";
    default:
      return "Complete the current Synthesis page first.";
  }
}

/**
 * Detail line for the Build stage. Never claims approval from the mere
 * presence of an execution specification.
 */
export function buildStageDetail(thread) {
  const state = thread?.state || {};
  const status = normalizeStatus(state.execution?.status);
  if (status === "pending_approval") return "Approval required";
  if (status === "failed") return "Execution failed";
  if (POST_APPROVAL_STATUSES.includes(status)) return "Approved execution";
  if (state.execution_spec) return "Execution specified";
  return "Execution record";
}

/**
 * The frozen composition uses a numbered construction strip only after the
 * researcher has accepted a method. Evidence mapping and a draft proposal are
 * useful work, but neither is permission to show a process as underway.
 */
export function synthesisShowsStageStrip(thread) {
  const state = thread?.state || {};
  const status = normalizeStatus(state.execution?.status);
  return Boolean(state.execution_spec) || status === "pending_approval" || POST_APPROVAL_STATUSES.includes(status);
}

/**
 * The five-row execution track. `completed` advances the worker row only —
 * archive/registry remain unverified until an explicit registered or
 * query_ready state, and query readiness is never inferred from registration.
 */
export function executionTrack(status, registered, queryReady = false) {
  const normalized = normalizeStatus(status);
  const approved = POST_APPROVAL_STATUSES.includes(normalized);
  const workerDone = ["registering", "archiving", "registered", "query_ready", "completed"].includes(normalized);
  const archiveDone = ["registered", "query_ready"].includes(normalized);
  const archiveActive = ["registering", "archiving"].includes(normalized);
  return [
    { label: "Method accepted", detail: "Revision bound", state: "done" },
    {
      label: "Researcher approval",
      detail: normalized === "pending_approval" ? "Decision required" : approved ? "Approved" : "Not requested",
      state: normalized === "pending_approval" ? "now" : approved ? "done" : "",
    },
    {
      label: "Worker build",
      detail: normalized === "running"
        ? "Running"
        : normalized === "queued"
          ? "Queued"
          : workerDone
            ? "Completed"
            : normalized === "failed"
              ? "Failed"
              : "Waiting",
      state: normalized === "failed"
        ? "failed"
        : ["queued", "running"].includes(normalized)
          ? "now"
          : workerDone
            ? "done"
            : "",
    },
    {
      label: "Archive + registry",
      detail: archiveActive
        ? "Verifying"
        : archiveDone
          ? "Verified"
          : normalized === "completed"
            ? "Awaiting verification"
            : "Waiting",
      state: archiveActive ? "now" : archiveDone ? "done" : "",
    },
    {
      label: "Library handoff",
      detail: queryReady
        ? "Query-ready asset"
        : registered
          ? "Registered · query readiness unverified"
          : "Not registered",
      state: registered ? "done" : "",
    },
  ];
}

/**
 * Keep the evidence map in registered/query-ready state when measured nodes
 * exist. Show it from recorded nodes only — never invent a diagram.
 */
export function synthesisShowsEvidenceMap(thread) {
  return hasEvidenceNodes(thread);
}
