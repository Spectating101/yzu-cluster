import { cleanDescription } from "./discoverAdapters.js";
import { plainGrain } from "./plainText.js";

const APPROVAL_BOILERPLATE = /\s*Bounded official API collection requires approval; no local mirror is implied\.?/gi;
const CODE_LIKE = /(^|\s)[\w.]+\(["'][^"']*["']\)|=>|;\s*$|^\s*[{[]/;
const YEAR_ONLY = /^\d{4}$/;

const REPOSITORY_NAMES = {
  zenodo: "Zenodo",
  zenodo_api: "Zenodo",
  datacite: "DataCite",
  openalex: "OpenAlex",
  harvard_dataverse: "Harvard Dataverse",
  dataverse: "Dataverse",
  huggingface: "Hugging Face",
  hugging_face: "Hugging Face",
  duckduckgo_instant: "DuckDuckGo",
  figshare: "Figshare",
  kaggle: "Kaggle",
};

function same(a, b) {
  const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(a) === norm(b);
}

export function rowDescription(row = {}) {
  const title = row.title || row.name || row.label || "";
  for (const field of ["description", "recommended_use", "subtitle", "public_summary", "notes"]) {
    const text = cleanDescription(row[field]).replace(APPROVAL_BOILERPLATE, "").trim();
    if (!text || text.length < 12 || YEAR_ONLY.test(text) || CODE_LIKE.test(text)) continue;
    if (same(text.replace(/\.$/, ""), title)) continue;
    return text.length > 240 ? `${text.slice(0, 239).trimEnd()}…` : text;
  }
  return "";
}

function firstClause(value) {
  return String(value || "").split(";")[0].trim();
}

function plainList(value) {
  return firstClause(value).replace(/\s+/g, " ").replace(/^(\w+) (global|international)$/i, "$1, $2");
}

export function rowFacts(row = {}) {
  const grain = plainGrain(row.grain);
  const facts = [
    grain,
    plainList(row.frequency),
    plainList(row.geography),
    firstClause(row.licence || row.license),
  ].filter(Boolean);
  const seen = new Set();
  return facts.filter((fact) => {
    const key = fact.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function repositoryName(row = {}) {
  const raw = String(row.repository || row.publisher || row.provider || row.source || "").trim();
  if (!raw) return "";
  return REPOSITORY_NAMES[raw.toLowerCase()] || (/_/.test(raw) ? "" : raw);
}

const WEB_SEARCH_ENGINES = new Set(["tavily", "duckduckgo_instant", "duckduckgo", "brave", "bing", "google"]);

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function rowCitation(row = {}) {
  const engine = String(row.source || row.publisher || "").trim().toLowerCase();
  if (WEB_SEARCH_ENGINES.has(engine)) return hostOf(row.url);
  const year = String(row.publication_year || row.year || "").trim();
  return [repositoryName(row), /^\d{4}$/.test(year) ? year : ""].filter(Boolean).join(" · ");
}

export const DISCOVER_GROUPS = [
  { id: "library", label: "In your Library", keys: ["local-"] },
  { id: "collectable", label: "Collectable sources", keys: ["external-acquirable", "external-probed"] },
  { id: "access", label: "Needs access review", keys: ["licensed-manual", "external-unavailable"] },
  { id: "web", label: "Repositories and the web", note: "access not checked", keys: ["external-discoverable"] },
];

export function discoverGroupOf(taxonomyKey = "") {
  const key = String(taxonomyKey || "");
  return DISCOVER_GROUPS.find((group) => group.keys.some((prefix) => key === prefix || (prefix.endsWith("-") && key.startsWith(prefix))))
    || DISCOVER_GROUPS[DISCOVER_GROUPS.length - 1];
}

const WORK_FIELDS = ["description", "notes", "public_summary", "repository", "publication_year", "doi"];

function workKey(row = {}) {
  const title = String(row.title || row.name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!title) return "";
  return title.split(" ").length >= 4 ? title : `${title}|${repositoryName(row).toLowerCase()}`;
}

function yearOf(row = {}) {
  const year = String(row.publication_year || row.year || "").trim();
  return /^\d{4}$/.test(year) ? year : "";
}

export function collapseSameWork(rows = [], exclude = []) {
  const taken = new Map(exclude.map((row) => [workKey(row), row]).filter(([key]) => key));
  const out = [];
  const index = new Map();
  for (const row of rows) {
    const key = workKey(row);
    const prior = key ? taken.get(key) || (index.has(key) ? out[index.get(key)] : null) : null;
    if (prior && (!yearOf(prior) || !yearOf(row) || yearOf(prior) === yearOf(row))) {
      if (index.has(key)) {
        const keep = rowDescription(prior) || !rowDescription(row) ? prior : row;
        const other = keep === prior ? row : prior;
        const filled = WORK_FIELDS.filter((field) => !String(keep[field] ?? "").trim() && String(other[field] ?? "").trim());
        out[index.get(key)] = filled.length ? { ...keep, ...Object.fromEntries(filled.map((field) => [field, other[field]])) } : keep;
      }
      continue;
    }
    if (key) index.set(key, out.length);
    out.push(row);
  }
  return out;
}
