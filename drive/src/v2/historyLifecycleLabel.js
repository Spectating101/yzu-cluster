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

export function historyLifecycleLabel(event) {
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
    // Never promote receipt_only / non-query holdings to Query ready from status text alone.
    if (truth.queryReady) return "Query ready";
    // The feed reports query_ready / usable / readiness on the event itself.
    // Keying only off catalog_reconciliation collapsed a held, usable asset and
    // an archived, unusable one into the same "Registered" label.
    if (
      event?.query_ready === false ||
      event?.usable === false ||
      status === "registered_not_queryable"
    ) {
      return "Not query-ready";
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

export function historyLifecycleExplanation(event) {
  const label = historyLifecycleLabel(event);
  const status = String(event?.status || event?.meta?.status || "").toLowerCase();
  const meta = event?.meta || {};

  switch (label) {
    case "Cancelled":
      return {
        label,
        explanation: "This request was cancelled. It is not collecting and does not need recovery.",
        risk: "No durable Library asset is expected from this request.",
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
        next: "Resume the refresh, or accept the current snapshot as the working asset.",
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
        next: "Investigate available source and access routes.",
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
        risk: "Observed output is not a registered Library asset.",
        next: "Track extraction evidence and wait for a reviewable result.",
      };
    case "Schema review":
      return {
        label,
        explanation: "Collection returned evidence that needs a researcher-owned shape or mapping decision.",
        risk: "Unreviewed fields are not silently normalized into a research asset.",
        next: "Review the recorded evidence shape or mapping.",
      };
    case "Queued":
      return {
        label,
        explanation: "The approved request is waiting for a worker.",
        risk: "Output is not yet a registered Library asset.",
        next: "Track progress until archive and registry evidence are confirmed.",
      };
    case "Collecting":
      return {
        label,
        explanation: "Collection is active. The current evidence below is the last durable update.",
        risk: "Output is not yet a registered Library asset.",
        next: "Track progress until archive and registry evidence are confirmed.",
      };
    case "Blocked — needs recovery":
    case "Failed — needs recovery":
      return {
        label,
        explanation: "The latest execution did not complete. Existing request evidence is preserved.",
        risk: "Do not treat the output as registered or query-ready.",
        next: "Inspect the failure and create a revised request if the route changed.",
      };
    case "Not query-ready":
      return {
        label,
        explanation: "The desk holds a registration receipt for this object, but it is not queryable.",
        risk: "Nothing here can be read into an analysis; treat it as a record, not as data.",
        next: "Re-collect the object, or open it in Library to see what the holding is missing.",
      };
    case "Registered · reconciliation pending":
      return {
        label,
        explanation:
          "The desk holds this object and reports it usable, but the registry row could not be read back, so catalog equivalence is unconfirmed.",
        risk: "Query results may not match what the catalog claims about this object.",
        next: "Open it in Library to confirm the schema before relying on it.",
      };
    case "Query ready":
      return {
        label,
        explanation: "The registered asset has an explicit query-ready authority state.",
        risk: "Use the recorded query evidence rather than inferring readiness from registration alone.",
        next: "Open the asset in Library or inspect its query evidence.",
      };
    case "Registered": {
      const archive = meta.archive_verified === true || event?.archive_verified === true;
      const readback = meta.registry_readback === true || event?.registry_readback === true;
      return {
        label,
        explanation:
          archive && readback
            ? "Archive verification and canonical registry read-back both succeeded for this Library asset."
            : "The durable record reports registration; inspect its proof fields before reuse.",
        risk: "Registered is not Query ready. No query capability is claimed here.",
        next: "Open the exact Library asset or ask about its provenance and readiness gap.",
      };
    }
    case "Completed":
    case "Archived":
      return {
        label,
        explanation: "The latest durable record reports completion. Verify registry/readiness evidence before reuse.",
        risk: "Completion alone does not imply registration or query readiness.",
        next: "Inspect the output and its supporting evidence.",
      };
    default:
      return {
        label,
        explanation: "The lifecycle record does not report a named research stage.",
        risk: "Do not infer route, method, or execution state from an absent record.",
        next: "Inspect the technical record or wait for the next durable update.",
      };
  }
}
