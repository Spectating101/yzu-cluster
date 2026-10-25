import { isQueryReady } from "./discoverTaxonomy.js";
import { plainGrain } from "./plainText.js";

function words(value) {
  return String(value || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function fields(row) {
  const list = (value) => (Array.isArray(value) ? value.join(" ") : String(value || ""));
  return [
    [3, `${row.display_name || ""} ${row.name || ""} ${row.title || ""}`],
    [2, `${row.dataset_id || ""} ${list(row.aliases)} ${list(row.keywords)} ${list(row.tags)}`],
    [1, `${row.one_line || ""} ${row.description || ""} ${row.source_system || ""} ${row.meaning_about || ""}`],
  ].map(([weight, text]) => [weight, new Set(words(text))]);
}

function hit(set, token) {
  if (set.has(token)) return true;
  for (const word of set) if (word.startsWith(token)) return true;
  return false;
}

export function matchLibraryInputs(catalog, query, { exclude = [], limit = 8 } = {}) {
  const tokens = [...new Set(words(query))].filter((token) => token.length > 1 || /\d/.test(token));
  if (!tokens.length) return [];
  const skip = new Set(exclude.map(String));
  const scored = [];
  for (const row of Array.isArray(catalog) ? catalog : []) {
    const id = String(row?.dataset_id || "");
    if (!id || skip.has(id)) continue;
    const sets = fields(row);
    let score = 0;
    let matched = 0;
    for (const token of tokens) {
      const weight = Math.max(0, ...sets.filter(([, set]) => hit(set, token)).map(([w]) => w));
      if (weight) matched += 1;
      score += weight;
    }
    if (matched === tokens.length) scored.push({ row, score });
  }
  scored.sort((a, b) => b.score - a.score || String(a.row.display_name || a.row.name).localeCompare(String(b.row.display_name || b.row.name)));
  return scored.slice(0, limit).map(({ row }) => ({
    datasetId: String(row.dataset_id),
    name: String(row.display_name || row.name || row.title || row.dataset_id).replace(/^Synthesis:\s+/i, ""),
    grain: plainGrain(row.grain),
    ready: isQueryReady(row),
    oneLine: String(row.one_line || "").trim(),
  }));
}
