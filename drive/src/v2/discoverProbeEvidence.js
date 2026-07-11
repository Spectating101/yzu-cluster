/**
 * Discover probe evidence presentation (Evaluation Surface E1).
 *
 * Categories are semantic authorities:
 *   VERIFIED              — demonstrated by probe/backend evidence
 *   INFERRED              — deterministic conclusion from evidence
 *   MODEL INTERPRETATION  — model-generated text (must be marked)
 *   UNKNOWN               — no evidence
 *
 * HTTP success alone never implies legal / open / complete / acquirable.
 */

import { candidateKey, discoverCandidateUrl } from "./candidateKey.js";

export const EVIDENCE_KIND = {
  VERIFIED: "verified",
  INFERRED: "inferred",
  MODEL: "model",
  UNKNOWN: "unknown",
};

function trim(value) {
  return String(value ?? "").trim();
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Bound probe result for this candidate only.
 * Mismatched candidate_key is ignored (D0 identity contract).
 */
export function boundProbeResult(row, probeState) {
  if (!row || typeof row !== "object") return null;
  const rowKey = trim(row.candidate_key) || candidateKey(row);
  if (!rowKey) return null;

  const candidates = [];
  if (row.probe_snapshot) candidates.push(row.probe_snapshot);
  if (row.probe_result) candidates.push(row.probe_result);
  if (probeState?.result && !probeState.loading) {
    candidates.push({
      ...probeState.result,
      candidate_key:
        probeState.result.candidate_key ||
        probeState.candidateKey ||
        null,
    });
  }

  for (const evidence of candidates) {
    if (!evidence || typeof evidence !== "object") continue;
    const evidenceKey = trim(evidence.candidate_key || evidence.candidateKey);
    if (evidenceKey && evidenceKey === rowKey) return evidence;
  }
  return null;
}

function pushFact(list, kind, label, detail = "") {
  list.push({ kind, label, detail: trim(detail) });
}

/**
 * Build classified probe facts from a bound probe result + row.
 * @returns {{ verified: object[], inferred: object[], model: object[], technical: object[] }}
 */
export function classifyProbeEvidence(row, probeResult) {
  const verified = [];
  const inferred = [];
  const model = [];
  const technical = [];

  const requested = discoverCandidateUrl(row) || trim(row.url) || trim(row.source_url);
  const resolved = trim(probeResult?.resolved_url) || trim(probeResult?.connector?.spec?.source_url);
  const connector = probeResult?.connector || {};
  const spec = connector.spec || {};
  const status = probeResult?.http_status ?? probeResult?.status_code ?? spec.http_status;
  const contentType = trim(spec.content_type || probeResult?.content_type);
  const contentLength = spec.content_length ?? probeResult?.content_length;
  const etag = trim(spec.etag || probeResult?.etag);
  const lastModified = trim(spec.last_modified || probeResult?.last_modified);
  const files = Array.isArray(spec.discovered_files) ? spec.discovered_files : [];
  const accessMode = trim(spec.access_mode || connector.access_mode);
  const summary = trim(probeResult?.summary);
  const domain = hostFromUrl(resolved || requested);

  // Observed domain only — row publisher metadata is not independently verified.
  if (domain) {
    pushFact(verified, EVIDENCE_KIND.VERIFIED, `${domain} domain observed`, domain);
  }
  if (requested) {
    pushFact(technical, EVIDENCE_KIND.VERIFIED, "Requested URL", requested);
  }
  if (resolved) {
    pushFact(verified, EVIDENCE_KIND.VERIFIED, "Resolved URL confirmed", resolved);
    pushFact(technical, EVIDENCE_KIND.VERIFIED, "Resolved URL", resolved);
  }
  if (status != null && status !== "") {
    const code = Number(status);
    if (Number.isFinite(code)) {
      pushFact(verified, EVIDENCE_KIND.VERIFIED, `HTTP endpoint responded (${code})`, String(code));
      pushFact(technical, EVIDENCE_KIND.VERIFIED, "HTTP status", String(code));
    }
  } else if (probeResult) {
    // Successful probe without explicit status — only claim response if connector/spec present
    if (contentType || files.length || accessMode) {
      pushFact(verified, EVIDENCE_KIND.VERIFIED, "Endpoint response observed");
    }
  }
  if (contentType) {
    pushFact(verified, EVIDENCE_KIND.VERIFIED, `${contentType} response`, contentType);
    pushFact(technical, EVIDENCE_KIND.VERIFIED, "Content type", contentType);
  }
  if (contentLength != null && contentLength !== "") {
    pushFact(technical, EVIDENCE_KIND.VERIFIED, "Content length", String(contentLength));
  }
  if (etag) pushFact(technical, EVIDENCE_KIND.VERIFIED, "ETag", etag);
  if (lastModified) pushFact(technical, EVIDENCE_KIND.VERIFIED, "Last-Modified", lastModified);
  if (files.length) {
    pushFact(verified, EVIDENCE_KIND.VERIFIED, `${files.length} file${files.length === 1 ? "" : "s"} observed`);
    pushFact(
      technical,
      EVIDENCE_KIND.VERIFIED,
      "Observed files",
      files
        .map((f) => (typeof f === "string" ? f : f.url || f.name || ""))
        .filter(Boolean)
        .slice(0, 5)
        .join(", "),
    );
  }
  if (accessMode) {
    pushFact(technical, EVIDENCE_KIND.VERIFIED, "Access mode", accessMode);
    if (/direct_file|download|csv|json|parquet/i.test(accessMode)) {
      pushFact(inferred, EVIDENCE_KIND.INFERRED, `Likely ${accessMode.replace(/_/g, " ")}`);
    } else if (/auth|login|credential/i.test(accessMode)) {
      pushFact(inferred, EVIDENCE_KIND.INFERRED, "Authentication may be required");
    } else if (/paginat/i.test(accessMode)) {
      pushFact(inferred, EVIDENCE_KIND.INFERRED, "Appears paginated");
    }
  }
  if (contentType && /csv|tsv|json|parquet|ndjson/i.test(contentType)) {
    pushFact(inferred, EVIDENCE_KIND.INFERRED, "Likely machine-readable tabular/file response");
  }
  const connectorId = trim(connector.connector_id || connector.id);
  if (connectorId) {
    pushFact(technical, EVIDENCE_KIND.VERIFIED, "Connector ID", connectorId);
  }
  if (summary) {
    // Probe summaries are connector/heuristic text — treat as model/interpretation, not verified.
    pushFact(model, EVIDENCE_KIND.MODEL, "Probe summary", summary);
    pushFact(technical, EVIDENCE_KIND.MODEL, "Raw probe summary", summary);
  }

  return { verified, inferred, model, technical };
}

/**
 * Concise verified bullets for the primary surface (2–5).
 */
export function primaryVerifiedFacts(classified) {
  const items = (classified?.verified || []).slice(0, 4);
  return items.map((f) => f.label);
}

/**
 * Honest unknowns derived from missing evidence / taxonomy.
 * Local usability uncertainty ≠ external acquisition uncertainty.
 */
export function deriveUnknowns(row, taxonomy, classified, hasProbe) {
  const unknowns = [];
  const key = taxonomy?.key || "";
  const verifiedLabels = new Set((classified?.verified || []).map((f) => f.label.toLowerCase()));

  const hasAny = (...fields) => fields.some((f) => trim(row?.[f]));

  if (key === "local-query-ready" || key === "local-connected" || key === "local-metadata") {
    if (key === "local-connected") {
      unknowns.push("Instant query path not confirmed");
    }
    if (key === "local-metadata") {
      unknowns.push("Usable local data path not confirmed");
    }
    if (!hasAny("freshness", "last_refresh", "refreshed_at", "updated_at", "as_of")) {
      unknowns.push("Freshness / last refresh not described");
    }
    if (!hasAny("caveats", "limitations", "known_issues", "quality_notes")) {
      unknowns.push("Known caveats not described");
    }
    if (!hasAny("coverage", "date_range", "temporal_coverage", "geographic_coverage")) {
      unknowns.push("Coverage completeness not verified");
    } else if (!hasAny("coverage", "date_range", "temporal_coverage")) {
      unknowns.push("Temporal coverage not fully described");
    }
    if (!hasAny("schema", "columns", "schema_summary", "variables")) {
      unknowns.push("Schema details not shown");
    }
  } else if (!hasProbe) {
    unknowns.push("Source endpoint not probed");
    unknowns.push("Acquisition constraints not verified");
    unknowns.push("Schema not inspected");
    if (!hasAny("coverage", "date_range", "temporal_coverage")) {
      unknowns.push("Temporal coverage not described");
    }
  } else {
    if (![...verifiedLabels].some((l) => l.includes("content type") || l.includes("response"))) {
      unknowns.push("Content type not confirmed");
    }
    if (![...verifiedLabels].some((l) => l.includes("file"))) {
      unknowns.push("Bulk-download route not confirmed");
    }
    unknowns.push("Coverage completeness not verified");
    unknowns.push("Schema not fully inspected");
  }

  if (key === "licensed-manual") {
    unknowns.push("Entitlement / credential path not confirmed in-session");
  }
  if (key === "external-unavailable") {
    unknowns.push("No supported acquisition route confirmed");
  }

  const seen = new Set();
  const out = [];
  for (const u of unknowns) {
    const k = u.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(u);
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * HTTP 200 / probe success must never be treated as legal/open/acquirable by itself.
 */
export function probeImpliesAcquisition(probeResult) {
  return false;
}

export function probeImpliesLegalClearance(probeResult) {
  return false;
}
