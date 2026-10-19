import { licensedRowsLocked } from "./licensedAccess.js";

export const FOCUS_LIMIT = 12;
const PER_GRAIN_LIMIT = 3;
const THIN_GRAINS = new Set(["catalog_harvest", "scrape_snapshot"]);

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "into", "that", "this", "using", "use", "used", "about", "over",
  "data", "dataset", "datasets", "research", "analysis", "study", "studies", "paper", "model", "models",
  "project", "work", "based", "effect", "effects", "impact", "new", "how", "what", "why", "are", "was",
]);

const NAME_FIELDS = ["display_name", "name", "title", "dataset_id"];
const TAG_FIELDS = ["tags", "keywords", "aliases"];
const TEXT_FIELDS = ["one_line", "description", "meaning_about", "recommended_use", "shelf_hint", "source_system"];

function textOf(value) {
  if (Array.isArray(value)) return value.map(textOf).join(" ");
  if (value && typeof value === "object") return "";
  return String(value ?? "").toLowerCase().replace(/[_-]+/g, " ");
}

function fieldText(row, fields) {
  return fields.map((field) => textOf(row?.[field])).join(" ");
}

function tokens(value) {
  return textOf(value)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function listOf(value) {
  return (Array.isArray(value) ? value : [value]).map((item) => String(item ?? "").trim()).filter(Boolean);
}

export function profileFocus(document) {
  if (!document || !document.principal) return { signedIn: false, terms: [], label: "" };
  const profile = document.profile || {};
  const memory = document.memory || {};
  const learned = memory?.settings?.use_memory === false
    ? []
    : (memory.memories || []).map((item) => item?.value);
  const phrases = [
    ...listOf(profile.current_project),
    ...listOf(profile.research_topics),
    ...listOf(profile.methods),
    ...listOf(learned),
  ];
  const terms = [...new Set(phrases.flatMap(tokens))].slice(0, 24);
  const label = [...listOf(profile.research_topics), ...listOf(profile.current_project)].slice(0, 3).join(", ")
    || phrases.slice(0, 3).join(", ");
  return { signedIn: true, terms, label };
}

function readable(rows) {
  return (rows || []).filter((row) => row && row.dataset_id && !licensedRowsLocked(row));
}

export function featuredRows(rows) {
  return readable(rows)
    .filter((row) => Number.isFinite(Number(row.featured_rank)) && Number(row.featured_rank) > 0)
    .sort((a, b) => Number(a.featured_rank) - Number(b.featured_rank))
    .slice(0, FOCUS_LIMIT);
}

function matchesTerm(text, term) {
  return new RegExp(`(?:^|[^a-z0-9])${term.replace(/[^a-z0-9]/g, "")}`).test(text);
}

export function matchedRows(rows, terms) {
  const pool = readable(rows);
  if (!terms?.length || !pool.length) return [];
  const haystacks = pool.map((row) => ({
    name: fieldText(row, NAME_FIELDS),
    tags: fieldText(row, TAG_FIELDS),
    text: fieldText(row, TEXT_FIELDS),
  }));
  const weight = new Map();
  for (const term of terms) {
    const df = haystacks.filter((h) => matchesTerm(`${h.name} ${h.tags} ${h.text}`, term)).length;
    if (df) weight.set(term, Math.log(1 + pool.length / df));
  }
  const scored = pool.map((row, index) => {
    const h = haystacks[index];
    let score = 0;
    for (const [term, idf] of weight) {
      if (matchesTerm(h.name, term)) score += 3 * idf;
      else if (matchesTerm(h.tags, term)) score += 2 * idf;
      else if (matchesTerm(h.text, term)) score += idf;
    }
    if (THIN_GRAINS.has(String(row.grain || ""))) score *= 0.5;
    if (Number(row.featured_rank) > 0) score *= 1.25;
    return { row, score };
  }).filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score
    || (Number(a.row.featured_rank) || 999) - (Number(b.row.featured_rank) || 999)
    || String(a.row.dataset_id).localeCompare(String(b.row.dataset_id)));
  const perGrain = new Map();
  const out = [];
  for (const { row } of scored) {
    const grain = String(row.grain || "");
    const taken = perGrain.get(grain) || 0;
    if (taken >= PER_GRAIN_LIMIT) continue;
    perGrain.set(grain, taken + 1);
    out.push(row);
    if (out.length >= FOCUS_LIMIT) break;
  }
  return out;
}

export function libraryLenses(rows, focus) {
  const forYou = matchedRows(rows, focus?.terms);
  const featured = featuredRows(rows);
  const lenses = [];
  if (forYou.length) lenses.push({ id: "for_you", label: "For your research", rows: forYou });
  if (featured.length) lenses.push({ id: "featured", label: "Featured", rows: featured });
  return lenses;
}

export function lensNote(lens, focus) {
  if (lens === "for_you") {
    return focus?.label
      ? `Matched to your research: ${focus.label}. Update it in Profile.`
      : "Matched to your research profile. Update it in Profile.";
  }
  if (lens === "featured") {
    return focus?.signedIn && !focus.terms.length
      ? "The datasets most worth opening first. Add your research focus in Profile and this view will follow your work."
      : "The datasets most worth opening first. Search or pick a collection to see everything.";
  }
  return "";
}
