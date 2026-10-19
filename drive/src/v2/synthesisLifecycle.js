/**
 * Synthesis lifecycle truth labels and journey authority.
 *
 * These keep the Synthesis state distinctions honest:
 *
 *   objective != evidence mapped != method specified != proposal reviewed
 *   accepted method != bounded preview != researcher approval != approved execution
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
  { id: "preview", label: "Preview", detail: "Test the accepted recipe on bounded bytes" },
  { id: "approval", label: "Approval", detail: "Authorize the exact previewed execution" },
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
  const state = thread?.state || {};
  const constructions = Array.isArray(state.constructions) ? state.constructions : [];
  const chosen =
    constructions.find((construction) => construction?.recommended === true) ||
    (state.recommended_construction && typeof state.recommended_construction === "object"
      ? state.recommended_construction
      : null);
  if (!chosen) return false;
  const nodes = Array.isArray(chosen.nodes) ? chosen.nodes : [];
  return nodes.some((node) => text(node?.id || node?.dataset_id || node?.source || node?.label));
}

export function synthesisPreviewTruth(thread) {
  const state = thread?.state || {};
  const preview = state.preview || {};
  const acceptedHash = text(state.accepted_spec_hash);
  const previewHash = text(preview.spec_hash);
  const current = Boolean(acceptedHash && previewHash && acceptedHash === previewHash);
  return {
    preview,
    acceptedHash,
    previewHash,
    current,
    succeeded: current && normalizeStatus(preview.status) === "succeeded",
    failed: current && normalizeStatus(preview.status) === "failed",
    stale: Boolean(previewHash && acceptedHash && previewHash !== acceptedHash),
  };
}

/**
 * The current working page is earned only by persisted thread truth.
 *
 * An accepted execution_spec now earns Preview, not Approval. A successful
 * preview receipt stays on Preview until an execution request is submitted;
 * pending_approval alone earns Approval. `completed` remains Build because a
 * finished worker has not yet established archive / registry promotion.
 */
export function synthesisJourneyStage(thread) {
  if (!thread?.id) return "objective";
  const state = thread.state || {};
  const status = normalizeStatus(state.execution?.status);

  if (["registered", "query_ready"].includes(status)) return "result";
  if (["queued", "running", "registering", "archiving", "completed", "failed"].includes(status)) return "build";
  if (status === "pending_approval") return "approval";
  if (status === "spec_accepted" || state.execution_spec) return "preview";
  if (state.proposal) return "proposal";
  if (hasRecommendedConstruction(thread) || hasEvidenceNodes(thread)) return "specification";
  return "evidence";
}

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

export function resolveSynthesisJourneyStage(thread, requestedStage = "") {
  const journey = synthesisJourney(thread);
  const requested = text(requestedStage).toLowerCase();
  const requestedIndex = JOURNEY_INDEX[requested];
  if (!Number.isInteger(requestedIndex) || requestedIndex > journey.currentIndex) {
    return journey.current;
  }
  return requested;
}

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
    case "preview":
      return "Accept an exact proposal revision before running a bounded preview.";
    case "approval":
      return "Run and review a successful bounded preview of this accepted revision first.";
    case "build":
      return "Approve the exact previewed execution request before a worker may run.";
    case "result":
      return "A worker result must be verified and registered before Result is available.";
    default:
      return "Complete the current Synthesis page first.";
  }
}

export function buildStageDetail(thread) {
  const state = thread?.state || {};
  const status = normalizeStatus(state.execution?.status);
  if (status === "pending_approval") return "Approval required";
  if (status === "failed") return "Execution failed";
  if (POST_APPROVAL_STATUSES.includes(status)) return "Approved execution";
  if (state.execution_spec) {
    const preview = synthesisPreviewTruth(thread);
    if (preview.failed) return "Bounded preview failed";
    if (preview.succeeded) return "Bounded preview passed";
    return "Bounded preview required";
  }
  return "Execution record";
}

export function synthesisShowsStageStrip(thread) {
  const state = thread?.state || {};
  const status = normalizeStatus(state.execution?.status);
  return Boolean(state.execution_spec) || status === "pending_approval" || POST_APPROVAL_STATUSES.includes(status);
}

/**
 * Execution authority track. Preview is explicit: an accepted method is not an
 * approval request, and a successful bounded preview is not a full build.
 */
export function executionTrack(status, registered, queryReady = false, preview = {}) {
  const normalized = normalizeStatus(status);
  const approved = POST_APPROVAL_STATUSES.includes(normalized);
  const workerDone = ["registering", "archiving", "registered", "query_ready", "completed"].includes(normalized);
  const archiveDone = ["registered", "query_ready"].includes(normalized);
  const archiveActive = ["registering", "archiving"].includes(normalized);
  const previewState = normalizeStatus(preview?.status);
  const previewDone = previewState === "succeeded";
  const previewFailed = previewState === "failed";
  return [
    { label: "Method accepted", detail: "Revision bound", state: "done" },
    {
      label: "Bounded preview",
      detail: previewDone ? "Passed" : previewFailed ? "Failed" : "Required",
      state: previewDone ? "done" : previewFailed ? "failed" : normalized === "spec_accepted" || !normalized ? "now" : "",
    },
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

export function synthesisShowsEvidenceMap(thread) {
  return hasEvidenceNodes(thread);
}
