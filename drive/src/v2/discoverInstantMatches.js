const STOP = new Set(["the", "and", "for", "with", "from", "data", "dataset", "datasets", "of", "in", "on", "to", "a", "an"]);

function terms(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 2 && !STOP.has(term));
}

export function instantLibraryMatches(catalog, query, { limit = 6, maxTerms = 4 } = {}) {
  const wanted = terms(query);
  if (!wanted.length || wanted.length > maxTerms) return [];
  return (Array.isArray(catalog) ? catalog : [])
    .filter((row) => row?.dataset_id)
    .map((row) => {
      const haystack = [row.title, row.name, row.description, row.dataset_id].join(" ").toLowerCase();
      const titleText = [row.title, row.name].join(" ").toLowerCase();
      if (!wanted.every((term) => haystack.includes(term))) return null;
      return { row, score: wanted.filter((term) => titleText.includes(term)).length };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => row);
}
