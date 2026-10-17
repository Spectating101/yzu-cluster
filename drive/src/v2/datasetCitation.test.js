import test from "node:test";
import assert from "node:assert/strict";
import { datasetCitation } from "./datasetCitation.js";

const BLS = {
  dataset_id: "bls_laus_county",
  name: "County unemployment rate, NY/Miami-Dade/King/Philadelphia 2019-2024",
  source: "U.S. Bureau of Labor Statistics",
  source_url: "https://www.bls.gov/lau/",
  fetched_at: "2026-10-02T03:14:00Z",
};

test("an APA data set citation names the source, title, retrieval date, URL and Library id", () => {
  const { apa } = datasetCitation(BLS);
  assert.equal(
    apa,
    "U.S. Bureau of Labor Statistics. (n.d.). County unemployment rate, NY/Miami-Dade/King/Philadelphia 2019-2024 [Data set; Research Drive bls_laus_county]. Retrieved October 2, 2026, from https://www.bls.gov/lau/",
  );
});

test("BibTeX keeps the organisation as one author and records the access date", () => {
  const { bib } = datasetCitation(BLS);
  assert.match(bib, /^@misc\{bls_laus_county,/);
  assert.match(bib, /author = \{\{U\.S\. Bureau of Labor Statistics\}\}/);
  assert.match(bib, /urldate = \{2026-10-02\}/);
  assert.match(bib, /url = \{https:\/\/www\.bls\.gov\/lau\/\}/);
});

test("a DOI is cited through the resolver in preference to other URLs", () => {
  const { apa, bib } = datasetCitation({ ...BLS, doi: "10.5281/zenodo.123" });
  assert.match(apa, /from https:\/\/doi\.org\/10\.5281\/zenodo\.123/);
  assert.match(bib, /url = \{https:\/\/doi\.org\/10\.5281\/zenodo\.123\}/);
});

test("an endpoint reconstructed from a saved recipe is not presented as the citable source", () => {
  const { apa, hasUrl } = datasetCitation({
    ...BLS,
    source_url: "https://api.bls.gov/publicAPI/v1/timeseries/data/",
    source_url_basis: "reconstructed_from_saved_recipe",
  });
  assert.equal(hasUrl, false);
  assert.doesNotMatch(apa, /api\.bls\.gov/);
  assert.match(apa, /\[Data set; Research Drive bls_laus_county\]\. Retrieved October 2, 2026\.$/);
});

test("with no recorded source the title leads, and no author or date is invented", () => {
  const { apa, bib, hasDate } = datasetCitation({ dataset_id: "x1", name: "Uploaded panel" });
  assert.equal(hasDate, false);
  assert.equal(apa, "Uploaded panel [Data set; Research Drive x1]. (n.d.).");
  assert.doesNotMatch(bib, /urldate|author/);
});
