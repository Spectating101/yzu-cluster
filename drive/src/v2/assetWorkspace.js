/** Split registry-observed asset facts from unknown / unverified claims. */

import {
  detailFields,
  displayName,
  formatMetaValue,
  isQueryReadyReadiness,
  statusPillKind,
} from "./datasetMeta.js";

function pushFact(list, label, value) {
  const text = value == null || value === "" ? "" : String(value).trim();
  if (!text || text === "—") return;
  list.push({ label, value: text });
}

function datasetProvenance(dataset) {
  return (
    dataset?.provenance ||
    dataset?.originating_job_id ||
    dataset?.job_id ||
    dataset?.collection?.job_id ||
    dataset?.collect_via ||
    dataset?.backend ||
    ""
  );
}

function datasetFreshness(dataset) {
  const raw = dataset?.updated_at || dataset?.last_modified || dataset?.as_of || dataset?.generated_at;
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return formatMetaValue(raw);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Build Asset Workspace sections from fields currently present on registry rows.
 * Missing facts stay in `unknown` — never invent readiness, schedules, or quality scores.
 */
export function buildAssetWorkspaceModel(dataset) {
  if (!dataset) {
    return {
      title: "",
      id: "",
      readiness: null,
      overview: { observed: [], unknown: [] },
      fields: { observed: [], unknown: [] },
      quality: { observed: [], unknown: [] },
      provenance: { observed: [], unknown: [] },
    };
  }

  const fields = detailFields(dataset);
  const pill = statusPillKind(dataset);
  const readinessRaw = dataset.analysis_readiness;
  const provenance = datasetProvenance(dataset);
  const freshness = datasetFreshness(dataset);
  const coverage = fields.coverage || dataset.coverage || dataset.date_range;
  const joinKeys = fields.joinKeys || dataset.join_keys || [];
  const entityFields = dataset.entity_fields || [];
  const timeField = dataset.time_field || null;

  const overviewObserved = [];
  const overviewUnknown = [];
  pushFact(overviewObserved, "Title", displayName(dataset));
  pushFact(overviewObserved, "Dataset id", dataset.dataset_id);
  if (readinessRaw) {
    pushFact(overviewObserved, "Readiness", formatMetaValue(readinessRaw) || pill.label);
  } else {
    pushFact(overviewUnknown, "Readiness", "Not reported by registry");
  }
  pushFact(overviewObserved, "Source", fields.source);
  if (!fields.source) pushFact(overviewUnknown, "Source", "Not reported");
  pushFact(overviewObserved, "Coverage", formatMetaValue(coverage));
  if (!coverage) pushFact(overviewUnknown, "Coverage", "Not reported");
  pushFact(overviewObserved, "Use", fields.use);
  if (!fields.use) pushFact(overviewUnknown, "Recommended use", "Not reported");

  const fieldsObserved = [];
  const fieldsUnknown = [];
  pushFact(fieldsObserved, "Grain", formatMetaValue(dataset.grain));
  if (!dataset.grain) pushFact(fieldsUnknown, "Grain", "Not reported");
  if (timeField) pushFact(fieldsObserved, "Time field", timeField);
  else pushFact(fieldsUnknown, "Time field", "Not reported");
  if (entityFields.length) pushFact(fieldsObserved, "Entity fields", entityFields.join(", "));
  else pushFact(fieldsUnknown, "Entity fields", "Not reported");
  if (joinKeys.length) pushFact(fieldsObserved, "Join keys", joinKeys.join(", "));
  else pushFact(fieldsUnknown, "Join keys", "Not reported");
  pushFact(fieldsObserved, "Partition", fields.partition);
  if (!fields.partition) pushFact(fieldsUnknown, "Partition", "Not reported");

  const qualityObserved = [];
  const qualityUnknown = [];
  if (readinessRaw) {
    pushFact(qualityObserved, "Analysis readiness", formatMetaValue(readinessRaw) || pill.label);
  } else {
    pushFact(qualityUnknown, "Analysis readiness", "Not verified");
  }
  pushFact(qualityObserved, "Access", fields.access);
  if (!fields.access) pushFact(qualityUnknown, "Access", "Not verified");
  if (fields.limitations) pushFact(qualityObserved, "Limitations", fields.limitations);
  else pushFact(qualityUnknown, "Limitations", "Not reported");
  pushFact(qualityUnknown, "Quality score", "Not provided by registry");
  pushFact(qualityUnknown, "Row completeness", "Not provided by registry");

  const provenanceObserved = [];
  const provenanceUnknown = [];
  pushFact(provenanceObserved, "Provenance", provenance);
  if (!provenance) pushFact(provenanceUnknown, "Provenance", "Not reported beyond registry");
  pushFact(provenanceObserved, "Vault path", fields.vault);
  if (!fields.vault) pushFact(provenanceUnknown, "Vault path", "Not reported");
  pushFact(provenanceObserved, "Freshness", freshness);
  if (!freshness) pushFact(provenanceUnknown, "Freshness", "Not reported");
  pushFact(
    provenanceObserved,
    "Route",
    formatMetaValue(dataset.collect_via || dataset.backend || ""),
  );
  if (!dataset.collect_via && !dataset.backend) {
    pushFact(provenanceUnknown, "Collection route", "Not reported");
  }

  return {
    title: displayName(dataset),
    id: dataset.dataset_id || "",
    readiness: readinessRaw ? pill : { kind: "remote", label: "Readiness unknown" },
    overview: { observed: overviewObserved, unknown: overviewUnknown },
    fields: { observed: fieldsObserved, unknown: fieldsUnknown },
    quality: { observed: qualityObserved, unknown: qualityUnknown },
    provenance: { observed: provenanceObserved, unknown: provenanceUnknown },
  };
}

/**
 * Compact Detail rail when Asset Workspace owns Overview/Fields/Quality/Provenance.
 * Identity + research-position judgment + unknowns + one next action — no registry fact dump.
 */
export function buildAssetDecisionInstrument(dataset) {
  if (!dataset) {
    return {
      title: "",
      id: "",
      readiness: null,
      judgment: "",
      unknowns: [],
      nextActionKey: null,
      nextActionLabel: "",
    };
  }

  const fields = detailFields(dataset);
  const pill = statusPillKind(dataset);
  const ready = isQueryReadyReadiness(dataset.analysis_readiness);
  const coverage = fields.coverage || dataset.coverage || dataset.date_range;
  const provenance = datasetProvenance(dataset);

  const unknowns = [];
  if (!dataset.analysis_readiness) {
    unknowns.push("Readiness not reported by registry");
  }
  if (!coverage) unknowns.push("Coverage not reported");
  if (!dataset.grain) unknowns.push("Grain not reported");
  if (!provenance) unknowns.push("Provenance not reported beyond registry");
  if (fields.limitations) unknowns.push(String(fields.limitations).slice(0, 160));

  let judgment;
  if (ready) {
    judgment = "Query-ready holding — open rows or reuse as Discover context.";
  } else if (fields.limitations) {
    judgment = `${pill.label} — ${String(fields.limitations).slice(0, 120)}`;
  } else if (!dataset.analysis_readiness) {
    judgment = "Readiness unknown — inspect centre registry facts before analysis.";
  } else {
    judgment = `${pill.label} — inspect readiness and provenance before analysis.`;
  }

  return {
    title: displayName(dataset),
    id: dataset.dataset_id || "",
    readiness: pill,
    judgment,
    unknowns,
    nextActionKey: "preview",
    nextActionLabel: "Preview rows",
  };
}
