import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UNNAMED_ROUTE, collectRouteLabel, isNamedRoute } from "./collectRouteLabel.js";

describe("collectRouteLabel", () => {
  it("names the route kinds the live backend actually emits", () => {
    assert.equal(collectRouteLabel("http_manifest"), "a file manifest");
    assert.equal(collectRouteLabel("web_scrape"), "browser extraction");
    assert.equal(collectRouteLabel("local_open"), "a local file");
    assert.equal(collectRouteLabel("datacite"), "the DataCite API");
    assert.equal(collectRouteLabel("huggingface"), "the Hugging Face API");
  });

  it("names the freeze's route vocabulary", () => {
    assert.equal(collectRouteLabel("bigquery"), "BigQuery");
    assert.equal(collectRouteLabel("lseg"), "LSEG data API");
    assert.equal(collectRouteLabel("queue"), "queue");
    assert.equal(collectRouteLabel("api_query"), "an API query");
  });

  it("says nothing when there is no route", () => {
    assert.equal(collectRouteLabel(""), "");
    assert.equal(collectRouteLabel(null), "");
    assert.equal(collectRouteLabel(undefined), "");
    assert.equal(collectRouteLabel("none"), "");
  });

  it("never leaks an unknown connector id to the researcher", () => {
    assert.equal(collectRouteLabel("mops_tw"), UNNAMED_ROUTE);
    assert.equal(collectRouteLabel("some_internal_connector_42"), UNNAMED_ROUTE);
  });

  it("normalises case, spaces and hyphens", () => {
    assert.equal(collectRouteLabel("HTTP-Manifest"), "a file manifest");
    assert.equal(collectRouteLabel("  web scrape  "), "browser extraction");
  });

  it("takes the first entry when collect_via is an array", () => {
    assert.equal(collectRouteLabel(["bigquery", "queue"]), "BigQuery");
  });

  it("isNamedRoute separates known kinds from unnamed ones", () => {
    assert.equal(isNamedRoute("bigquery"), true);
    assert.equal(isNamedRoute("mops_tw"), false);
    assert.equal(isNamedRoute(""), false);
  });
});
