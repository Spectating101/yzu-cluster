/**
 * Discover result-quality classification — truthful presentation when
 * source-map hits are generic capability routes or external catalogue
 * rows are weakly related to the active evidence need.
 *
 * Backend fields (optional, backwards-compatible):
 *   confident_match, relevance_score, relevance_reason, query_match,
 *   source_kind, route_state
 */

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "to",
  "in",
  "on",
  "with",
  "from",
  "into",
  "around",
  "before",
  "after",
  "across",
  "i",
  "need",
  "want",
  "looking",
  "find",
  "get",
  "my",
  "our",
  "this",
  "that",
  "these",
  "those",
  "are",
  "is",
  "be",
  "as",
  "by",
  "at",
  "it",
  "we",
  "you",
  "me",
  "data",
  "dataset",
  "datasets",
  "evidence",
  "source",
  "sources",
]);

const GENERIC_SOURCE_KINDS = new Set([
  "capability_route",
  "provider_route",
  "lab_route",
  "connector_route",
  "generic_route",
]);

const GENERIC_ROUTE_STATES = new Set([
  "generic",
  "capability",
  "available_route",
  "provider_route",
  "route_only",
]);

/** Minimum normalized relevance (0–1) for a credible match when scores exist. */
export const RELEVANCE_FLOOR = 0.4;

export function meaningfulQueryTerms(query = "") {
  const raw = String(query || "")
    .replace(/[^\p{L}\p{N}\s+-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP.has(t.toLowerCase()));
  const seen = new Set();
  const terms = [];
  for (const token of raw) {
    const key = token.toLowerCase();
    if (seen.has(key) || key.length < 3) continue;
    seen.add(key);
    terms.push(key);
  }
  return terms;
}

export function candidateSearchText(row = {}) {
  return [
    row?.title,
    row?.name,
    row?.source,
    row?.publisher,
    row?.description,
    row?.recommended_use,
    row?.relevance_reason,
    ...(Array.isArray(row?.capabilities) ? row.capabilities : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Normalize relevance_score to 0–1. Accepts 0–1 fractions and 0–100 percents.
 * Returns null when absent or non-numeric.
 */
export function normalizeRelevanceScore(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > 1) return Math.min(1, n / 100);
  return n;
}

function truthyFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null || value === "") return false;
  const text = String(value).trim().toLowerCase();
  if (!text) return false;
  if (["true", "yes", "y", "1"].includes(text)) return true;
  if (["false", "no", "n", "0"].includes(text)) return false;
  return false;
}

function hasExplicitNegativeMatch(row = {}) {
  if (row.confident_match != null && truthyFlag(row.confident_match) === false) return true;
  if (row.query_match != null && truthyFlag(row.query_match) === false) return true;
  return false;
}

function hasExplicitPositiveMatch(row = {}) {
  if (truthyFlag(row.confident_match)) return true;
  if (truthyFlag(row.query_match)) return true;
  const score = normalizeRelevanceScore(row.relevance_score);
  if (score != null && score >= RELEVANCE_FLOOR) return true;
  return false;
}

function isMarkedGenericRoute(row = {}) {
  const kind = String(row.source_kind || row.result_kind || "").trim().toLowerCase();
  const state = String(row.route_state || "").trim().toLowerCase();
  return GENERIC_SOURCE_KINDS.has(kind) || GENERIC_ROUTE_STATES.has(state);
}

function lexicalOverlapScore(row, query) {
  const terms = meaningfulQueryTerms(query);
  if (!terms.length) return 0;
  const title = String(row?.title || row?.name || "").toLowerCase();
  const text = candidateSearchText(row);
  return terms.reduce(
    (total, term) => total + (title.includes(term) ? 8 : 0) + (text.includes(term) ? 2 : 0),
    0,
  );
}

function hasLexicalQueryOverlap(row, query) {
  return lexicalOverlapScore(row, query) > 0;
}

/**
 * A source-map / lab route row is a "relevant source match" for the query.
 * Generic capability routes without confident backend signals never qualify.
 */
export function isRelevantSourceMatch(row = {}, query = "") {
  if (!row || typeof row !== "object") return false;
  if (hasExplicitPositiveMatch(row)) return true;
  if (hasExplicitNegativeMatch(row)) return false;
  if (isMarkedGenericRoute(row)) return false;
  return hasLexicalQueryOverlap(row, query);
}

export function hasRelevantSourceMatch(rows = [], query = "") {
  return (rows || []).some((row) => isRelevantSourceMatch(row, query));
}

export function filterRelevantSourceRows(rows = [], query = "") {
  return (rows || []).filter((row) => isRelevantSourceMatch(row, query));
}

/**
 * External catalogue credibility: prefer backend signals, else require
 * lexical overlap. Explicit negative match / low score rejects the row.
 */
export function isCredibleExternalMatch(row = {}, query = "") {
  if (!row || typeof row !== "object") return false;
  if (truthyFlag(row.confident_match)) return true;
  if (row.query_match != null && truthyFlag(row.query_match)) return true;
  if (row.query_match != null && truthyFlag(row.query_match) === false) return false;
  if (row.confident_match != null && truthyFlag(row.confident_match) === false) return false;

  const score = normalizeRelevanceScore(row.relevance_score);
  if (score != null) {
    if (score >= RELEVANCE_FLOOR) return true;
    if (score < RELEVANCE_FLOOR) return false;
  }

  return hasLexicalQueryOverlap(row, query);
}

export function filterCredibleExternalRows(rows = [], query = "") {
  return (rows || []).filter((row) => isCredibleExternalMatch(row, query));
}

export function rankExternalCatalogueRows(rows = [], query = "") {
  return [...(rows || [])].sort((left, right) => {
    const scored = (row) => {
      const backend = normalizeRelevanceScore(row?.relevance_score);
      const lexical = lexicalOverlapScore(row, query);
      const boost = truthyFlag(row?.confident_match) || truthyFlag(row?.query_match) ? 100 : 0;
      return boost + (backend != null ? backend * 50 : 0) + lexical;
    };
    return scored(right) - scored(left);
  });
}

/**
 * Compose presentation kind + display rows for Explore centre.
 * Does not mutate input rows; preserves candidate identity fields.
 */
export function presentDiscoverResultQuality({
  rows = [],
  query = "",
  source = "",
  externalSearchActive = false,
} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const q = String(query || "").trim();
  const externalActive =
    Boolean(externalSearchActive) || source === "external_catalogues" || source === "web";

  if (externalActive) {
    const credible = rankExternalCatalogueRows(filterCredibleExternalRows(list, q), q);
    if (!credible.length) {
      return {
        kind: "empty",
        sectionTitle: "",
        displayRows: [],
        showRouteGapBanner: false,
        emptyMessage: q
          ? `No credible external catalogue match for “${q}”.`
          : "No credible external catalogue match.",
        nextAction: "refine_or_lab_routes",
        otherSectionTitle: "Other catalogue records",
        footNote: "Only catalogue records with credible relevance to this question are shown",
      };
    }
    return {
      kind: "external_catalogue_matches",
      sectionTitle: "External catalogue matches",
      displayRows: credible,
      showRouteGapBanner: false,
      emptyMessage: "",
      nextAction: null,
      otherSectionTitle: "Other catalogue records",
      footNote: "Ordered by relevance to this question",
    };
  }

  if (!list.length) {
    return {
      kind: "empty",
      sectionTitle: "",
      displayRows: [],
      showRouteGapBanner: false,
      emptyMessage: q ? `No matches for “${q}”.` : "No matches.",
      nextAction: null,
      otherSectionTitle: "Other matches",
      footNote: "",
    };
  }

  const relevant = filterRelevantSourceRows(list, q);
  if (relevant.length) {
    // Per-row filter only — do not promote unrelated locals into this heading.
    return {
      kind: "relevant_source_matches",
      sectionTitle: "Relevant source matches",
      displayRows: relevant,
      showRouteGapBanner: false,
      emptyMessage: "",
      nextAction: null,
      otherSectionTitle: "Other matches",
      footNote: "Ranked using active research + interpreted evidence need",
    };
  }

  // Generic capability / provider routes only — truthful lab-route framing.
  return {
    kind: "available_lab_routes",
    sectionTitle: "Available lab routes",
    displayRows: list,
    showRouteGapBanner: Boolean(q) && (source === "sources" || source === "demo" || !source),
    emptyMessage: "",
    nextAction: "search_external",
    otherSectionTitle: "Other matches",
    footNote: "These are available lab routes, not evidence matches for this question",
  };
}
