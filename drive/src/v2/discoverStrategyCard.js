/**
 * Discover selected-row strategy card (FROZEN_RENDERS frame 10, block 14).
 *
 * Every block is emitted from measured assessment or recorded intent only.
 * Absent measurement produces an `omitted` reason instead of placeholder copy,
 * and the build chain stops at the durable-request boundary rather than
 * promising verification or registration that no job records.
 *
 * Frames 2–3 (WHAT EVIDENCE ARE YOU LOOKING FOR / BEST FIT / OTHER MATCHES)
 * are withdrawn; `WITHDRAWN_STRATEGY_VOCABULARY` guards against reintroducing them.
 */

import { coverageParts } from "./discoverEvaluation.js";
import { discoverCandidateUrl } from "./candidateKey.js";
import { collectRouteLabel } from "./collectRouteLabel.js";
import { intentCollection, intentState } from "./discoverIntent.js";

export const WITHDRAWN_STRATEGY_VOCABULARY = Object.freeze([
  "WHAT EVIDENCE ARE YOU LOOKING FOR",
  "BEST FIT",
  "OTHER MATCHES",
  "Compare coverage",
]);

const ACCESS = Object.freeze({
  OBSERVED: "observed",
  PROPOSED: "proposed",
  UNKNOWN: "unknown",
});

function text(value) {
  return String(value ?? "").trim();
}

function firstOf(value) {
  if (Array.isArray(value)) return text(value[0]);
  return text(value);
}

function connectorId(row) {
  const connector = row?.connector || row?.probe_snapshot?.connector || {};
  return text(
    connector.connector_id || connector.id || row?.connector_id || firstOf(row?.collect_via),
  );
}

function measuredFields(row) {
  const raw = row?.columns || row?.schema || row?.variables || row?.fields;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => (typeof entry === "string" ? text(entry) : text(entry?.name || entry?.column)))
    .filter(Boolean);
}

function accessAssessment(row, evaluation) {
  const verified = Array.isArray(evaluation?.verified) ? evaluation.verified : [];
  if (evaluation?.hasProbe && verified.length) {
    const endpoint = verified.find((label) => /endpoint/i.test(label));
    return { access: ACCESS.OBSERVED, accessDetail: endpoint || verified[0] };
  }
  const declared = text(row?.access_mode || row?.source_access_mode || row?.access_state);
  if (declared) return { access: ACCESS.PROPOSED, accessDetail: declared };
  if (connectorId(row)) {
    return { access: ACCESS.PROPOSED, accessDetail: `Collection route declared · ${connectorId(row)}` };
  }
  return { access: ACCESS.UNKNOWN, accessDetail: "" };
}

/**
 * Accepts either the durable intent record ({ intent, researchNeed }) or a bare intent.
 */
function normalizeIntent(input) {
  if (!input || typeof input !== "object") return { intent: null, researchNeed: "" };
  if (input.intent && typeof input.intent === "object") {
    return { intent: input.intent, researchNeed: text(input.researchNeed) };
  }
  return { intent: input, researchNeed: "" };
}

/** The recorded research need, with the field that recorded it. */
function recordedNeed({ intent, researchNeed }) {
  const declared = text(intent?.research_need);
  if (declared) return { need: declared, source: "intent.research_need" };
  const stated = text(intentState(intent).evidence_need);
  if (stated) return { need: stated, source: "intent.state.evidence_need" };
  if (researchNeed) return { need: researchNeed, source: "record.researchNeed" };
  return { need: "", source: "" };
}

function nextCheck(row, evaluation) {
  if (evaluation?.hasProbe) return "Coverage verification";
  if (discoverCandidateUrl(row)) return "Probe endpoint";
  return "Not recorded";
}

/**
 * @param {object} row selected Discover candidate
 * @param {object} evaluation result of buildDiscoverEvaluation (already lifecycle-applied)
 * @param {{ intent?: object, primaryAction?: {id: string, label: string} }} options
 */
export function buildDiscoverStrategyCard(row, evaluation, options = {}) {
  const { intent: intentInput = null, primaryAction = null } = options;
  const intentRecord = normalizeIntent(intentInput);
  const intent = intentRecord.intent;
  const blocks = [];
  const omitted = [];

  const grain = text(row?.grain || row?.unit_of_observation);
  const coverage = coverageParts(row).filter((part) => part !== grain);
  const fields = measuredFields(row);
  if (grain || coverage.length || fields.length) {
    blocks.push({
      id: "what_you_will_get",
      label: "What you will get",
      grain,
      coverage,
      fields,
      line: [grain, ...coverage].filter(Boolean).join(" · "),
    });
  } else {
    omitted.push({
      id: "what_you_will_get",
      label: "What you will get",
      reason: "No grain, coverage, or field shape is recorded on this candidate.",
    });
  }

  const { need, source: needSource } = recordedNeed(intentRecord);
  if (need) {
    blocks.push({
      id: "how_it_answers",
      label: "How it answers the question",
      need,
      source: needSource,
    });
  } else {
    omitted.push({
      id: "how_it_answers",
      label: "How it answers the question",
      reason: "No evidence need is recorded for this candidate.",
    });
  }

  const connector = connectorId(row);
  if (connector) {
    const routeLabel = collectRouteLabel(connector);
    const steps = [{
      label: routeLabel === "a declared route" ? "Collection route declared" : `Collect via ${routeLabel}`,
      evidence: "declared",
      detail: connector,
    }];
    if (grain) steps.push({ label: `Normalize to ${grain}`, evidence: "declared", detail: grain });
    const jobId = text(intentCollection(intent).job_id);
    if (jobId) steps.push({ label: "Verify + register", evidence: "measured", detail: jobId });
    blocks.push({
      id: "how_we_build",
      label: "How we build it",
      steps,
      boundary: jobId ? "" : "Source selected · no durable procurement request exists yet.",
    });
  } else {
    omitted.push({
      id: "how_we_build",
      label: "How we build it",
      reason: "No collection route is declared, so no build chain is recorded.",
    });
  }

  const { access, accessDetail } = accessAssessment(row, evaluation);
  blocks.push({
    id: "source_check",
    label: "Source check",
    row: {
      source: text(row?.source || row?.publisher || firstOf(row?.collect_via)) || "Not described",
      access,
      accessDetail,
      coverage: coverageParts(row).join(" · ") || ACCESS.UNKNOWN,
      nextCheck: nextCheck(row, evaluation),
    },
  });

  const unknowns = Array.isArray(evaluation?.unknowns) ? evaluation.unknowns : [];
  if (unknowns.length) {
    blocks.push({ id: "still_unknown", label: "Still unknown", items: unknowns });
  } else {
    omitted.push({
      id: "still_unknown",
      label: "Still unknown",
      reason: "No remaining unknown is recorded for this candidate.",
    });
  }

  const planned = new Set(["what_you_will_get", "how_it_answers", "how_we_build"]);

  return {
    title: text(evaluation?.title) || text(row?.title) || "Custom strategy",
    kicker: "Custom strategy",
    blocks,
    omitted,
    nextValidAction: primaryAction || evaluation?.actions?.primary || null,
    hasStrategy: blocks.some((b) => planned.has(b.id)),
  };
}
