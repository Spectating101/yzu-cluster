export function listedSources(row) {
  const sources = Array.isArray(row?.sources) ? row.sources : [];
  return sources.length > 1 ? sources : [];
}

export function sourceSummary(row, fallback = "Not recorded") {
  const sources = listedSources(row);
  if (!sources.length) return String(row?.source || row?.publisher || row?.source_system || fallback).trim();
  const names = [...new Set(sources.map((source) => String(source.source_system || source.name || "").trim()).filter(Boolean))];
  if (!names.length) return fallback;
  if (names.length === 1) return `${names[0]} · ${sources.length} files`;
  return names.length === 2 ? names.join(" + ") : `${names[0]} + ${names.length - 1} more`;
}

export function sourcesHeading(row) {
  const sources = listedSources(row);
  const independent = new Set(sources.map((source) => String(source.source_system || "").trim()).filter(Boolean)).size;
  if (independent > 1) return `Available from ${independent} sources`;
  return sources.length > 1 ? `${sources.length} files on record` : "";
}
