/**
 * Shared Discover History status vocabulary — list centre and Detail rail must agree.
 * Authority: DISCOVER_FULL_SCALE_FREEZE + Phase 1 cancelled ≠ Collecting / Route investigating.
 */

import { historyHoldingTruth, historyLifecycleBucket } from "./discoverAdapters.js";

const EXPLICIT_STAGE_LABELS = Object.freeze({
  route_investigating: "Route investigating",
  route_review: "Route investigating",
  method_review: "Method review",
  extracting: "Extracting",
  schema_review: "Schema review",
});

function explicitStage(event) {
  const meta = event?.meta || {};
  const value =
    meta.lifecycle_stage ||
    meta.research_stage ||
    meta.procurement_stage ||
    meta.evidence_stage ||
    event?.lifecycle_stage ||
    event?.research_stage ||
    "";
  return String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
}

// Keep the legacy status values used by decisions separate from display copy.
export function historyLifecycleInternalLabel(event) {
  const status = String(event?.status || event?.meta?.status || "").toLowerCase();
  const action = String(event?.kind || event?.action || "").toLowerCase();
  const truth = historyHoldingTruth(event);
  const stage = explicitStage(event);
  let kind = historyLifecycleBucket(event);
  if (kind === "all") {
    if (action === "intent") kind = "needs_approval";
    else if (action === "registered_asset") kind = "ready";
  }

  if (/cancelled|canceled/.test(status)) return "Cancelled";
  if (EXPLICIT_STAGE_LABELS[stage]) return EXPLICIT_STAGE_LABELS[stage];
  if (kind === "needs_approval") return "Approval required";
  if (kind === "scheduled" || /^(active|paused|stopped)$/.test(status)) {
    // active, paused and stopped all read as "Scheduled refresh" before this:
    // a stopped subscription will never run again and looked identical to a
    // live one. The distinction is the whole point of the state.
    if (status === "paused") return "Refresh paused";
    if (status === "stopped") return "Refresh stopped";
    if (kind === "scheduled") return "Scheduled refresh";
  }
  if (kind === "active") return status === "queued" ? "Queued" : "Collecting";
  if (kind === "needs_recovery") {
    if (/blocked/.test(status)) return "Blocked — needs recovery";
    return "Failed — needs recovery";
  }
  if (kind === "ready" || status === "registered" || action === "registered_asset") {
    // Never promote receipt_only / non-query holdings to Query-ready from status text alone.
    if (truth.queryReady) return "Query-ready";
    // The feed reports query_ready / usable / readiness on the event itself.
    // Keying only off catalog_reconciliation collapsed a held, usable asset and
    // an archived, unusable one into the same "Registered" label.
    if (
      event?.query_ready === false ||
      event?.usable === false ||
      status === "registered_not_queryable"
    ) {
      return "Registered · unconfirmed";
    }
    if (truth.receiptOnly && (event?.query_ready === true || event?.usable === true)) {
      // Held and reported usable, but the registry row could not be read back,
      // so equivalence with the catalog stays unconfirmed.
      return "Registered · reconciliation pending";
    }
    if (truth.receiptOnly || truth.registered) return "Registered";
    if (status === "archived") return "Archived";
    if (truth.completed || /completed|ready|done|succeeded/.test(status)) return "Completed";
    return "Completed";
  }
  return status ? status.replace(/[_-]+/g, " ") : "Status not reported";
}

const STATUS_LABELS = {
  "Approval required": "Waiting for your approval",
  "Blocked — needs recovery": "Blocked — needs attention",
  "Failed — needs recovery": "Failed — needs attention",
  "Registered · unconfirmed": "In Library · not yet checked",
  "Registered · reconciliation pending": "In Library · being checked",
  "Query-ready": "Ready to query",
  Registered: "Saved to Library",
};

export function historyLifecycleLabel(event) {
  const internalLabel = historyLifecycleInternalLabel(event);
  return Object.hasOwn(STATUS_LABELS, internalLabel) ? STATUS_LABELS[internalLabel] : internalLabel;
}

export function historyLifecycleExplanation(event) {
  const label = historyLifecycleLabel(event);
  const status = String(event?.status || event?.meta?.status || "").toLowerCase();
  const meta = event?.meta || {};

  switch (historyLifecycleInternalLabel(event)) {
    case "Cancelled":
      return {
        label,
        explanation: "This request was cancelled. It is not collecting and does not need recovery.",
        risk: "No dataset saved to Library is expected from this request.",
        next: "Start a revised request if the evidence need still stands.",
      };
    case "Scheduled refresh":
      return {
        label,
        explanation:
          meta.execution_mode === "non_executing"
            ? "The refresh request is recorded. Automatic execution is not claimed."
            : "The refresh schedule is recorded for this evidence object.",
        risk: "Confirm execution mode before relying on automatic refresh.",
        next: "Review the schedule or ask about its scope.",
      };
    case "Refresh paused":
      return {
        label,
        explanation: "This refresh is recorded but is not running. It resumes only when a researcher restarts it.",
        risk: "The evidence object will drift from its source while the refresh is paused.",
        next: "Resume the refresh, or use the current snapshot as your working dataset.",
      };
    case "Refresh stopped":
      return {
        label,
        explanation: "This refresh was stopped. It will not run again and no further collection is scheduled.",
        risk: "Nothing will update this evidence object; treat the last collection as final.",
        next: "Start a new refresh request if the evidence need still stands.",
      };
    case "Approval required":
      return {
        label,
        explanation: "This evidence request is waiting for a researcher decision before collection begins.",
        risk: "No collection has started.",
        next: "Review the source and the exact request before approval.",
      };
    case "Route investigating":
      return {
        label,
        explanation: "The request exists while a viable acquisition route is being established.",
        risk: "Acquisition method is not established.",
        next: "Review available collection methods and access requirements.",
      };
    case "Method review":
      return {
        label,
        explanation: "A collection method is proposed and awaits a researcher-owned decision.",
        risk: "The proposed method is not accepted or executing yet.",
        next: "Review or reject the recorded method.",
      };
    case "Extracting":
      return {
        label,
        explanation: "The evidence request reports active extraction.",
        risk: "Observed output has not been saved as a Library dataset.",
        next: "Track extraction evidence and wait for a reviewable result.",
      };
    case "Schema review":
      return {
        label,
        explanation: "Collection returned evidence that needs a researcher-owned shape or mapping decision.",
        risk: "Fields need review before being standardized in a research dataset.",
        next: "Review the recorded evidence shape or mapping.",
      };
    case "Queued":
      return {
        label,
        explanation: "The approved request is waiting for a worker.",
        risk: "Output has not yet been saved as a Library dataset.",
        next: "Track progress until archive and registry evidence are confirmed.",
      };
    case "Collecting":
      return {
        label,
        explanation: "Collection is active. The evidence below shows the last saved update.",
        risk: "Output has not yet been saved as a Library dataset.",
        next: "Track progress until archive and registry evidence are confirmed.",
      };
    case "Blocked — needs recovery":
      // A gate refused this collection — licence or access scope — so it never
      // executed. Telling the researcher to inspect a failure and revise the
      // route sends them after the wrong thing.
      return {
        label,
        explanation: "A licence or access gate refused this collection, so it never ran.",
        risk: "No evidence was collected, and re-running the same request will be refused again.",
        next: "Resolve the source’s access requirement, or choose a collection method Research Drive is licensed to use.",
      };
    case "Failed — needs recovery":
      return {
        label,
        explanation: "The latest execution did not complete. Existing request evidence is preserved.",
        risk: "Do not treat the output as saved to Library or ready to query.",
        next: "Inspect the failure and create a revised request if the route changed.",
      };
    case "Registered · unconfirmed":
      return {
        label,
        explanation: "Research Drive has a record of saving this dataset to Library, but it cannot be queried.",
        risk: "Nothing here can be read into an analysis; treat it as a record, not as data.",
        next: "Collect the data again, or open it in Library to see what is missing.",
      };
    case "Registered · reconciliation pending":
      return {
        label,
        explanation:
          "Research Drive has this dataset and reports it usable. Its Library record could not be read back, so a match with the catalog has not been confirmed.",
        risk: "Query results may not match what the catalog claims about this object.",
        next: "Open it in Library to confirm the schema before relying on it.",
      };
    case "Query-ready":
      return {
        label,
        explanation: "Checks confirm that this Library dataset is ready to query.",
        risk: "Use the recorded query evidence. Saving to Library alone does not confirm readiness.",
        next: "Open the dataset in Library or inspect its query evidence.",
      };
    case "Registered": {
      const archive = meta.archive_verified === true || event?.archive_verified === true;
      const readback = meta.registry_readback === true || event?.registry_readback === true;
      return {
        label,
        explanation:
          archive && readback
            ? "The archive was checked and the master Library record was read back successfully for this dataset."
            : "The saved record says the dataset was saved to Library. Inspect the verification details before reuse.",
        risk: "Saved to Library does not mean ready to query. Query access has not been confirmed here.",
        next: "Open this Library dataset or ask about its source history and what still needs to be checked.",
      };
    }
    case "Completed":
    case "Archived":
      return {
        label,
        explanation: "The latest saved record reports completion. Check that the output is saved to Library and ready for use before reuse.",
        risk: "Completion alone does not confirm the output is saved to Library or ready to query.",
        next: "Inspect the output and its supporting evidence.",
      };
    default:
      return {
        label,
        explanation: "The request record does not report a research stage.",
        risk: "Do not infer route, method, or execution state from an absent record.",
        next: "Inspect the technical record or wait for the next saved update.",
      };
  }
}
