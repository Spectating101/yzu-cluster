const INTERNAL_VISIBILITY = /^(internal|operator|ops|validation|test|fixture|hidden)$/i;
const FACULTY_VISIBILITY = /^(faculty|research|public|user|visible)$/i;

function values(row, paths) {
  return paths
    .map((path) => path.split(".").reduce((value, key) => value?.[key], row))
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function explicitVisibility(row) {
  return values(row, [
    "product_visibility",
    "visibility",
    "audience",
    "classification",
    "meta.product_visibility",
    "meta.visibility",
    "state.product_visibility",
  ])[0] || "";
}

function identifierText(row) {
  return values(row, [
    "dataset_id",
    "id",
    "thread_id",
    "job_id",
    "manifest_id",
    "output_dataset_id",
    "state.execution.output_dataset_id",
    "state.execution_spec.output_dataset_id",
    "plan.dataset_id",
    "plan.output_dataset_id",
  ]).join(" ");
}

function labelText(row) {
  return values(row, [
    "title",
    "name",
    "display_name",
    "objective",
    "summary",
    "description",
    "purpose",
    "label",
    "plan.title",
    "plan.name",
    "state.title",
    "state.objective",
  ]).join(" ");
}

function directTitle(row) {
  return String(row?.title || row?.name || row?.state?.title || "").trim();
}

function metadataText(row) {
  return values(row, [
    "kind",
    "type",
    "source",
    "source_route",
    "collect_via",
    "route",
    "tags",
    "labels",
    "meta.kind",
    "meta.source",
  ]).join(" ");
}

export function isInternalValidationRecord(row) {
  if (!row || typeof row !== "object") return false;

  const visibility = explicitVisibility(row);
  if (FACULTY_VISIBILITY.test(visibility)) return false;
  if (INTERNAL_VISIBILITY.test(visibility)) return true;

  if (/^(?:test|testing|smoke|canary|fixture)$/i.test(directTitle(row))) return true;

  const identifier = identifierText(row);
  if (/(?:^|[._-])(?:canary|smoke|fixture|mock|e2e|playwright|validation)(?:[._-]|$)/i.test(identifier)) return true;
  if (/(?:^|[._-])(?:landing|final)[._-]*(?:prove|proof)(?:[._-]|$)/i.test(identifier)) return true;
  if (/(?:^|[._-])(?:test|validation)[._-]*(?:run|job|dataset|thread|probe)(?:[._-]|$)/i.test(identifier)) return true;

  const label = labelText(row);
  if (/\b(?:landing|final)\s+(?:prove|proof)\b|\b(?:landing|final)\b.*\b(?:prove|proof)\b/i.test(label)) return true;
  if (/\b(?:agent|scheduled|deployment|windows|http|mcp|worker|integration|live)\b.*\bcanary\b|\bcanary\b.*\b(?:run|probe|test|validation)\b/i.test(label)) return true;
  if (/\b(?:live\s+)?smoke\s+(?:thread|run|test)\b|\bcomposer audit thread\b/i.test(label)) return true;
  if (/\b(?:playwright|mock e2e|smoke test|validation fixture|deployment probe)\b/i.test(label)) return true;

  const metadata = metadataText(row);
  return /\b(?:test_fixture|validation_run|smoke_run|operator_only)\b/i.test(metadata);
}

export function facultyFacingRecords(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !isInternalValidationRecord(row));
}

function homeResearchScore(row) {
  const title = directTitle(row);
  const readiness = values(row, [
    "analysis_readiness",
    "readiness",
    "query_status",
    "status",
    "authority.readiness",
  ]).join(" ");
  const grain = values(row, ["grain", "dataset_grain", "schema.grain"]).join(" ");
  const coverage = values(row, ["coverage", "date_range", "temporal_coverage"]).join(" ");
  const description = values(row, ["summary", "description", "purpose", "recommended_use"]).join(" ");
  const source = values(row, ["source", "publisher", "provider", "source_route"]).join(" ");
  let score = 0;

  if (row?.query_ready === true || /query.?ready|instant|analysis.?ready/i.test(readiness)) score += 140;
  else if (/connected|registered|available/i.test(readiness)) score += 28;

  if (description.length >= 40) score += 26;
  else if (description) score += 12;
  if (coverage) score += 14;
  if (source) score += 8;
  if (grain && !/procured.?snapshot|raw.?snapshot|receipt/i.test(grain)) score += 20;
  if (/panel|timeseries|time series|event|filing|market|governance|macro|microstructure|estimate|attention|news/i.test(`${title} ${description}`)) score += 18;

  if (/^(?:collect|procure|refresh|discover refresh|download|ingest|harvest)\b/i.test(title)) score -= 105;
  if (/\b(?:collect|procure|refresh)\b.*\b(?:receipt|snapshot|run)\b/i.test(`${title} ${description}`)) score -= 45;
  if (/procured.?snapshot|receipt.?only|metadata.?only/i.test(`${grain} ${readiness}`)) score -= 38;
  if (!title || /^(?:untitled|dataset)$/i.test(title)) score -= 25;

  return score;
}

export function rankFacultyHomeRecords(rows) {
  return facultyFacingRecords(rows)
    .map((row, index) => ({ row, index, score: homeResearchScore(row) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ row }) => row);
}
