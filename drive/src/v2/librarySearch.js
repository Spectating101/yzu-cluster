const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "could",
  "data",
  "dataset",
  "datasets",
  "do",
  "evidence",
  "file",
  "files",
  "find",
  "for",
  "from",
  "have",
  "i",
  "in",
  "is",
  "it",
  "library",
  "me",
  "my",
  "of",
  "on",
  "or",
  "research",
  "show",
  "that",
  "the",
  "this",
  "to",
  "used",
  "using",
  "want",
  "what",
  "where",
  "which",
  "with",
]);

const ALIAS_GROUPS = [
  ["day", "daily"],
  ["week", "weekly"],
  ["month", "monthly"],
  ["quarter", "quarterly"],
  ["year", "yearly", "annual", "annually"],
  ["paper", "papers", "article", "articles", "literature", "scholarly"],
  ["source", "sources", "connector", "connectors", "api", "apis"],
  ["equity", "equities", "stock", "stocks"],
];

const ALIASES = new Map();
for (const group of ALIAS_GROUPS) {
  for (const term of group) ALIASES.set(term, new Set(group));
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_/\\|:;,.()\[\]{}]+/g, " ")
    .replace(/[–—-]+/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singular(token) {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function queryConcepts(query) {
  const tokens = normalize(query)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => token.length >= 2 || /^\d{4}$/.test(token));

  const seen = new Set();
  return tokens
    .map((token) => {
      const root = singular(token);
      const variants = new Set([token, root]);
      for (const candidate of [token, root]) {
        const aliases = ALIASES.get(candidate);
        if (aliases) aliases.forEach((alias) => variants.add(alias));
      }
      const key = [...variants].sort().join("|");
      if (seen.has(key)) return null;
      seen.add(key);
      return { token, variants };
    })
    .filter(Boolean);
}

function flatten(value, depth = 0) {
  if (value == null || depth > 4) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    return text ? [text] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => flatten(item, depth + 1));
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => [key, ...flatten(item, depth + 1)]);
  }
  return [];
}

function values(row, keys) {
  return keys.flatMap((key) => flatten(row?.[key])).filter(Boolean);
}

function firstMatchingValue(fieldValues, concept) {
  for (const value of fieldValues) {
    const text = normalize(value);
    if ([...concept.variants].some((variant) => text.split(" ").includes(variant) || text.includes(variant))) {
      return String(value);
    }
  }
  return String(fieldValues[0] || "");
}

function fieldGroups(row = {}, navText = "") {
  return [
    {
      key: "identity",
      label: "name",
      weight: 13,
      values: values(row, ["dataset_id", "registry_id", "name", "display_name", "title", "doi"]),
    },
    {
      key: "topic",
      label: "topic",
      weight: 8,
      values: values(row, [
        "description",
        "one_line",
        "summary",
        "meaning_about",
        "recommended_use",
        "research_use",
        "keywords",
        "tags",
        "limitations",
        "domain",
      ]),
    },
    {
      key: "structure",
      label: "field",
      weight: 10,
      values: values(row, [
        "grain",
        "join_keys",
        "keys",
        "primary_key",
        "fields",
        "columns",
        "schema",
        "declared_fields",
        "declared_schema",
        "response_shape",
      ]),
    },
    {
      key: "coverage",
      label: "coverage",
      weight: 9,
      values: values(row, [
        "coverage",
        "date_range",
        "temporal_coverage",
        "geography",
        "geographies",
        "countries",
        "country",
        "market",
        "markets",
      ]),
    },
    {
      key: "source",
      label: "source",
      weight: 9,
      values: values(row, [
        "source",
        "publisher",
        "source_system",
        "source_route",
        "collect_via",
        "backend",
        "source_url",
        "provenance",
        "procurement",
      ]),
    },
    {
      key: "organization",
      label: "collection",
      weight: 6,
      values: [
        ...values(row, ["partition_id", "shelf_hint", "collection", "collections", "project", "projects"]),
        ...flatten(navText),
      ],
    },
    {
      key: "state",
      label: "state",
      weight: 4,
      values: values(row, [
        "analysis_readiness",
        "collection_status",
        "verification_state",
        "verification",
        "access_shape",
        "access_mode",
        "asset_kind",
        "object_type",
        "kind",
      ]),
    },
  ].filter((group) => group.values.length);
}

function conceptMatchesText(concept, text) {
  const tokens = new Set(text.split(" ").filter(Boolean));
  return [...concept.variants].some((variant) => tokens.has(variant) || text.includes(variant));
}

function evidenceReason(group, concepts) {
  const concept = concepts.find((candidate) =>
    conceptMatchesText(candidate, normalize(group.values.join(" "))),
  );
  if (!concept) return null;
  const value = firstMatchingValue(group.values, concept).replace(/\s+/g, " ").trim();
  if (!value) return null;
  const clipped = value.length > 54 ? `${value.slice(0, 51)}…` : value;
  return {
    kind: group.key,
    label: group.label,
    value: clipped,
  };
}

export function scoreLibraryAsset(row = {}, query = "", navText = "") {
  const normalizedQuery = normalize(query);
  const concepts = queryConcepts(query);
  if (!normalizedQuery || !concepts.length) {
    return {
      score: 0,
      coverage: 0,
      confidence: "none",
      matchedTerms: [],
      reasons: [],
      phraseMatch: false,
    };
  }

  const groups = fieldGroups(row, navText);
  const matchedConcepts = new Set();
  const reasons = [];
  let score = 0;
  let phraseMatch = false;

  for (const group of groups) {
    const blob = normalize(group.values.join(" "));
    if (!blob) continue;
    const groupMatches = concepts.filter((concept) => conceptMatchesText(concept, blob));
    if (!groupMatches.length) continue;

    for (const concept of groupMatches) matchedConcepts.add(concept.token);
    score += group.weight * groupMatches.length;

    if (normalizedQuery.length >= 3 && blob.includes(normalizedQuery)) {
      phraseMatch = true;
      score += group.weight * 4 + (group.key === "identity" ? 45 : 20);
    }
    if (groupMatches.length === concepts.length) score += group.weight * 2;

    const reason = evidenceReason(group, groupMatches);
    if (reason) reasons.push({ ...reason, weight: group.weight });
  }

  const coverage = matchedConcepts.size / concepts.length;
  score += Math.round(coverage * 50);

  const requiredMatches = concepts.length <= 2 ? 1 : Math.max(2, Math.ceil(concepts.length * 0.4));
  if (!phraseMatch && matchedConcepts.size < requiredMatches) score = 0;

  const confidence =
    score <= 0
      ? "none"
      : phraseMatch || (coverage >= 0.8 && score >= 70)
        ? "high"
        : coverage >= 0.5 || score >= 45
          ? "medium"
          : "low";

  reasons.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
  const uniqueReasons = [];
  const seenKinds = new Set();
  for (const reason of reasons) {
    if (seenKinds.has(reason.kind)) continue;
    seenKinds.add(reason.kind);
    uniqueReasons.push({ kind: reason.kind, label: reason.label, value: reason.value });
    if (uniqueReasons.length >= 3) break;
  }

  return {
    score,
    coverage,
    confidence,
    matchedTerms: [...matchedConcepts],
    reasons: uniqueReasons,
    phraseMatch,
  };
}

export function rankLibraryHoldings(rows = [], query = "", navByDataset = new Map()) {
  const q = String(query || "").trim();
  if (!q) return [...rows];

  return rows
    .map((row, index) => {
      const id = String(row?.dataset_id || row?.registry_id || "");
      const navText = navByDataset instanceof Map ? navByDataset.get(id) || "" : navByDataset?.[id] || "";
      const match = scoreLibraryAsset(row, q, navText);
      if (!match.score) return null;
      return {
        ...row,
        search_match: {
          query: q,
          score: match.score,
          coverage: match.coverage,
          confidence: match.confidence,
          matched_terms: match.matchedTerms,
          reasons: match.reasons,
          phrase_match: match.phraseMatch,
          original_index: index,
        },
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const scoreDelta = Number(right.search_match?.score || 0) - Number(left.search_match?.score || 0);
      if (scoreDelta) return scoreDelta;
      const coverageDelta = Number(right.search_match?.coverage || 0) - Number(left.search_match?.coverage || 0);
      if (coverageDelta) return coverageDelta;
      return Number(left.search_match?.original_index || 0) - Number(right.search_match?.original_index || 0);
    });
}

function resultLabel(row = {}) {
  return String(row.display_name || row.name || row.title || row.dataset_id || "Library asset").trim();
}

export function buildLibrarySearchAskPrompt(query, rows = []) {
  const q = String(query || "").trim();
  const candidates = rows.slice(0, 5).map((row) => {
    const reasons = Array.isArray(row.search_match?.reasons)
      ? row.search_match.reasons.map((reason) => `${reason.label}: ${reason.value}`).join("; ")
      : "";
    return `- ${resultLabel(row)} [${row.dataset_id || row.registry_id || "unknown id"}]${reasons ? ` — ${reasons}` : ""}`;
  });

  return {
    displayText: `Find in Library: ${q}`,
    prompt: [
      `Find the best evidence already held in my Library for: "${q}".`,
      "Search and describe Library holdings as needed. Rank evidence by what the asset actually contains, not just title similarity.",
      "Explain each recommended match using recorded identity/topic, schema or fields, grain, coverage, source/provenance, readiness, and verification when those facts exist.",
      "Do not treat external Discover candidates as held Library evidence. Do not infer missing schema, provenance, coverage, or verification.",
      "If no held asset materially fits, say that clearly and recommend Discover for the missing evidence rather than forcing a weak match.",
      candidates.length ? `Instant retrieval candidates:\n${candidates.join("\n")}` : "Instant retrieval found no confident held candidate.",
    ].join("\n\n"),
  };
}
