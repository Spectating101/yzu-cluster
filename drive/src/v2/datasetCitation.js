import { displayName } from "./datasetMeta.js";
import { librarySourceReceipt } from "./libraryProvenance.js";

const CITABLE_URL_KINDS = new Set(["Exact source URL", "DOI resolver"]);

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function retrievalDate(dataset, receipt) {
  const raw = text(receipt.fetchedAt || dataset?.retrieved_at || dataset?.fetched_at || dataset?.updated_at);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function longDate(date) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function bibKey(dataset) {
  return text(dataset?.dataset_id || displayName(dataset)).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "dataset";
}

function bibValue(value) {
  return text(value).replace(/[{}]/g, "");
}

export function datasetCitation(dataset = {}) {
  const receipt = librarySourceReceipt(dataset);
  const title = text(displayName(dataset));
  const author = text(dataset.source || dataset.publisher || dataset.source_system);
  const doi = text(dataset.doi || dataset.provenance?.doi);
  const url = doi ? `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}` : CITABLE_URL_KINDS.has(receipt.sourceUrlKind) ? receipt.sourceUrl : "";
  const retrieved = retrievalDate(dataset, receipt);
  const id = text(dataset.dataset_id);

  const apa = [
    author
      ? `${author.replace(/\.$/, "")}. (n.d.). ${title} [Data set${id ? `; Research Drive ${id}` : ""}].`
      : `${title} [Data set${id ? `; Research Drive ${id}` : ""}]. (n.d.).`,
    retrieved ? `Retrieved ${longDate(retrieved)}${url ? `, from ${url}` : "."}` : url,
  ].filter(Boolean).join(" ");

  const bib = [
    `@misc{${bibKey(dataset)},`,
    author ? `  author = {{${bibValue(author)}}},` : "",
    `  title = {${bibValue(title)}},`,
    "  type = {Data set},",
    url ? `  url = {${url}},` : "",
    retrieved ? `  urldate = {${retrieved.toISOString().slice(0, 10)}},` : "",
    id ? `  note = {Research Drive dataset ${bibValue(id)}},` : "",
    "}",
  ].filter(Boolean).join("\n");

  return { apa, bib, hasUrl: Boolean(url), hasDate: Boolean(retrieved) };
}
