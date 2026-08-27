/**
 * Discover selected-row offering profile.
 *
 * This remains an evidence-bound presentation model: every field is emitted
 * from candidate metadata, a bound probe snapshot, or the durable intent.
 * Missing structure stays missing; a successful endpoint response never
 * becomes invented schema, legal clearance, preview rows, or acquisition.
 */

import { coverageParts } from "./discoverEvaluation.js";
import { discoverCandidateUrl } from "./candidateKey.js";
import { collectRouteLabel } from "./collectRouteLabel.js";
import { intentCollection, intentState } from "./discoverIntent.js";
import { humanizeDiscoverDescription } from "./browseMeta.js";

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

function humanToken(value) {
  const raw = text(value);
  return raw ? humanizeDiscoverDescription(raw.replaceAll("_", " ")) : "";
}

function connectorId(row) {
  const connector = row?.connector || row?.probe_snapshot?.connector || {};
  return text(
    connector.connector_id || connector.id || row?.connector_id || firstOf(row?.collect_via),
  );
}

function schemaArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw.fields)) return raw.fields;
  if (Array.isArray(raw.columns)) return raw.columns;
  if (raw.properties && typeof raw.properties === "object") {
    return Object.keys(raw.properties);
  }
  return [];
}

function measuredFields(row) {
  const candidates = [row?.columns, row?.schema, row?.variables, row?.fields];
  for (const raw of candidates) {
    const entries = schemaArray(raw);
    if (!entries.length) continue;
    return [...new Set(entries
      .map((entry) => (typeof entry === "string" ? text(entry) : text(entry?.name || entry?.column || entry?.field)))
      .filter(Boolean))]
      .slice(0, 12);
  }
  return [];
}

function probeSpec(row) {
  return row?.probe_snapshot?.connector?.spec || row?.probe_result?.connector?.spec || {};
}

function observedFiles(row) {
  const files = probeSpec(row)?.discovered_files;
  if (!Array.isArray(files)) return [];
  return files
    .map((entry) => {
      if (typeof entry === "string") return text(entry);
      return text(entry?.name || entry?.filename || entry?.url);
    })
    .filter(Boolean)
    .slice(0, 8);
}

function formatLabel(row) {
  const spec = probeSpec(row);
  return humanToken(
    row?.file_format ||
    row?.format ||
    row?.media_type ||
    row?.content_type ||
    spec?.content_type,
  );
}

function scaleLabel(row) {
  const count = row?.row_count ?? row?.rows ?? row?.num_rows ?? row?.records;
  if (count != null && count !== "" && Number.isFinite(Number(count))) {
    return `${Number(count).toLocaleString()} rows declared`;
  }
  const size = text(row?.size || row?.dataset_size || row?.file_size || row?.bytes);
  return size ? `Scale ${size}` : "";
}

function providerLabel(row) {
  const direct = text(
    row?.provider ||
    row?.publisher ||
    row?.organization ||
    row?.source ||
    firstOf(row?.collect_via),
  );
  if (direct) return direct;
  try {
    return new URL(discoverCandidateUrl(row)).hostname.replace(/^www\./, "");
  } catch {
    return "Not described";
  }
}

function accessAssessment(row, evaluation) {
  const verified = Array.isArray(evaluation?.verified) ? evaluation.verified : [];
  if (evaluation?.hasProbe && verified.length) {
    const endpoint = verified.find((label) => /endpoint|domain|response/i.test(label));
    return { access: ACCESS.OBSERVED, accessDetail: endpoint || verified[0] };
  }
  const declared = text(row?.access_mode || row?.source_access_mode || row?.access_state);
  if (declared) {
    return {
      access: ACCESS.PROPOSED,
      accessDetail: humanToken(declared),
    };
  }
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

function nextCheck(row, evaluation, fields, files) {
  if (!fields.length) return "Inspect schema / fields";
  if (!evaluation?.hasProbe && discoverCandidateUrl(row)) return "Probe source endpoint";
  if (!files.length && evaluation?.hasProbe) return "Inspect downloadable artifacts";
  return "Verify coverage completeness";
}

function productLine(row, grain, coverage, files) {
  return [
    grain,
    ...coverage,
    formatLabel(row),
    scaleLabel(row),
    files.length ? `${files.length} file${files.length === 1 ? "" : "s"} observed` : "",
  ].filter(Boolean).join(" · ");
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
  const files = observedFiles(row);
  const productSummary = productLine(row, grain, coverage, files);

  if (grain || coverage.length || fields.length || files.length || formatLabel(row) || scaleLabel(row)) {
    blocks.push({
      id: "what_you_will_get",
      label: "Data product",
      grain,
      coverage,
      fields,
      files,
      line: productSummary,
    });
  } else {
    omitted.push({
      id: "what_you_will_get",
      label: "Data product",
      reason: "No grain, coverage, field shape, file inventory, format, or scale is recorded on this offering.",
    });
  }

  const { need, source: needSource } = recordedNeed(intentRecord);
  if (need) {
    blocks.push({
      id: "how_it_answers",
      label: "Research fit",
      need,
      source: needSource,
    });
  } else {
    omitted.push({
      id: "how_it_answers",
      label: "Research fit",
      reason: "No evidence need is recorded for this offering.",
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
      label: "Acquisition path",
      steps,
      boundary: jobId ? "" : "No acquisition request has been created yet.",
    });
  } else {
    omitted.push({
      id: "how_we_build",
      label: "Acquisition path",
      reason: "No collection route is declared for this offering.",
    });
  }

  const { access, accessDetail } = accessAssessment(row, evaluation);
  blocks.push({
    id: "source_check",
    label: "Access & source",
    row: {
      source: providerLabel(row),
      access,
      accessDetail,
      coverage: coverageParts(row).join(" · ") || ACCESS.UNKNOWN,
      nextCheck: nextCheck(row, evaluation, fields, files),
    },
  });

  const unknowns = Array.isArray(evaluation?.unknowns) ? evaluation.unknowns : [];
  if (unknowns.length) {
    blocks.push({ id: "still_unknown", label: "Still unknown", items: unknowns });
  } else {
    omitted.push({
      id: "still_unknown",
      label: "Still unknown",
      reason: "No remaining unknown is recorded for this offering.",
    });
  }

  const planned = new Set(["what_you_will_get", "how_it_answers", "how_we_build"]);

  return {
    title: text(evaluation?.title) || text(row?.title) || "Offering profile",
    kicker: "Offering profile",
    blocks,
    omitted,
    nextValidAction: primaryAction || evaluation?.actions?.primary || null,
    hasStrategy: blocks.some((b) => planned.has(b.id)),
  };
}
