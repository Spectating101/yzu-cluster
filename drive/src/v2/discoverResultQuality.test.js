import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterCredibleExternalRows,
  hasRelevantSourceMatch,
  isCredibleExternalMatch,
  isRelevantSourceMatch,
  presentDiscoverResultQuality,
  rankExternalCatalogueRows,
} from "./discoverResultQuality.js";

const GENERIC_ROUTES = [
  {
    title: "SEC EDGAR filings",
    source: "SEC",
    description: "US securities filings and disclosures",
    capabilities: ["filings", "company_facts"],
    candidate_key: "source:sec:edgar",
    source_kind: "capability_route",
  },
  {
    title: "Yahoo Finance quotes",
    source: "Yahoo",
    description: "Market quotes and historical prices",
    capabilities: ["quotes", "prices"],
    candidate_key: "source:yahoo:quotes",
    route_state: "generic",
  },
  {
    title: "Capital IQ company fundamentals",
    source: "Capital IQ",
    description: "Licensed fundamentals and comps",
    capabilities: ["fundamentals"],
    candidate_key: "source:capiq:fundamentals",
  },
];

const POLLING_QUERY = "US polling data";

describe("isRelevantSourceMatch", () => {
  it("rejects generic SEC/Yahoo/Capital IQ routes for an unrelated polling query", () => {
    for (const row of GENERIC_ROUTES) {
      assert.equal(isRelevantSourceMatch(row, POLLING_QUERY), false);
    }
  });

  it("accepts backend confident_match / query_match even without lexical overlap", () => {
    assert.equal(
      isRelevantSourceMatch(
        { title: "National survey archive", confident_match: true, candidate_key: "source:nsa" },
        POLLING_QUERY,
      ),
      true,
    );
    assert.equal(
      isRelevantSourceMatch(
        { title: "Survey vendor feed", query_match: true, candidate_key: "source:svf" },
        POLLING_QUERY,
      ),
      true,
    );
  });

  it("accepts high relevance_score on either 0-1 or 0-100 scale", () => {
    assert.equal(
      isRelevantSourceMatch(
        { title: "Election tracker", relevance_score: 0.72, candidate_key: "source:et" },
        POLLING_QUERY,
      ),
      true,
    );
    assert.equal(
      isRelevantSourceMatch(
        { title: "Election tracker", relevance_score: 72, candidate_key: "source:et2" },
        POLLING_QUERY,
      ),
      true,
    );
  });

  it("accepts lexical query overlap when backend fields are absent", () => {
    assert.equal(
      isRelevantSourceMatch(
        {
          title: "US polling aggregates",
          description: "National polling data series",
          candidate_key: "source:polls",
        },
        POLLING_QUERY,
      ),
      true,
    );
  });

  it("treats capability_route / generic route_state as non-matches without confident signals", () => {
    assert.equal(
      isRelevantSourceMatch(
        {
          title: "Polling connector skeleton",
          source_kind: "capability_route",
          description: "Generic provider route",
          candidate_key: "source:skel",
        },
        POLLING_QUERY,
      ),
      false,
    );
  });
});

describe("hasRelevantSourceMatch", () => {
  it("is false for only generic capability routes", () => {
    assert.equal(hasRelevantSourceMatch(GENERIC_ROUTES, POLLING_QUERY), false);
  });

  it("is true when any row is a relevant match", () => {
    assert.equal(
      hasRelevantSourceMatch(
        [...GENERIC_ROUTES, { title: "US polling data commons", candidate_key: "source:upc" }],
        POLLING_QUERY,
      ),
      true,
    );
  });
});

describe("external credibility", () => {
  it("drops weak external catalogue rows that lack query relevance", () => {
    const rows = [
      {
        title: "SEC company filings portal",
        description: "Browse EDGAR disclosures",
        candidate_key: "url:https://sec.example/edgar",
        relevance_score: 0.12,
      },
      {
        title: "US polling averages 2024",
        description: "National polling data",
        candidate_key: "url:https://polls.example/us",
        relevance_score: 0.81,
      },
    ];
    const credible = filterCredibleExternalRows(rows, POLLING_QUERY);
    assert.deepEqual(
      credible.map((row) => row.candidate_key),
      ["url:https://polls.example/us"],
    );
  });

  it("honours confident_match / query_match / relevance_reason fields when present", () => {
    assert.equal(
      isCredibleExternalMatch(
        {
          title: "Odd title",
          confident_match: true,
          relevance_reason: "cataloguer marked as election polls",
          candidate_key: "url:https://odd.example",
        },
        POLLING_QUERY,
      ),
      true,
    );
    assert.equal(
      isCredibleExternalMatch(
        { title: "Odd title", query_match: false, relevance_score: 0.1, candidate_key: "url:x" },
        POLLING_QUERY,
      ),
      false,
    );
  });

  it("ranks stronger lexical title matches first when scores are absent", () => {
    const ranked = rankExternalCatalogueRows(
      [
        { title: "Market data desk", description: "prices", candidate_key: "a" },
        { title: "US polling data desk", description: "surveys", candidate_key: "b" },
      ],
      POLLING_QUERY,
    );
    assert.equal(ranked[0].candidate_key, "b");
  });
});

describe("presentDiscoverResultQuality", () => {
  it("labels generic source-map hits as available lab routes, not Best fit", () => {
    const presentation = presentDiscoverResultQuality({
      rows: GENERIC_ROUTES,
      query: POLLING_QUERY,
      source: "sources",
    });
    assert.equal(presentation.kind, "available_lab_routes");
    assert.equal(presentation.sectionTitle, "Available lab routes");
    assert.equal(presentation.showRouteGapBanner, true);
    assert.equal(presentation.displayRows.length, GENERIC_ROUTES.length);
    assert.ok(!/best fit/i.test(presentation.sectionTitle));
  });

  it("labels lexical or confident source hits as relevant source matches", () => {
    const presentation = presentDiscoverResultQuality({
      rows: [{ title: "US polling data commons", candidate_key: "source:upc" }],
      query: POLLING_QUERY,
      source: "sources",
    });
    assert.equal(presentation.kind, "relevant_source_matches");
    assert.equal(presentation.sectionTitle, "Relevant source matches");
    assert.equal(presentation.showRouteGapBanner, false);
  });

  it("keeps only individually relevant rows under Relevant source matches when locals are mixed in", () => {
    const openAlexHit = {
      title: "US election polling aggregates",
      description: "OpenAlex record for national polling data",
      publisher: "OpenAlex",
      candidate_key: "url:https://openalex.org/Wpolling",
      relevance_score: 0.88,
    };
    const irrelevantLocals = [
      {
        title: "NHANES health examination survey",
        description: "National health and nutrition examination data",
        candidate_key: "source:nhanes:exam",
      },
      {
        title: "Climate model queue job",
        description: "Queued CMIP ensemble run",
        candidate_key: "job:climate-queue-12",
        queued: true,
      },
      {
        title: "Aviation delay statistics",
        description: "Airport on-time performance series",
        candidate_key: "source:bts:aviation",
      },
      {
        title: "Materials science papers index",
        description: "Local semantic paper hits",
        candidate_key: "semantic:papers:materials",
      },
    ];
    const presentation = presentDiscoverResultQuality({
      rows: [openAlexHit, ...irrelevantLocals],
      query: POLLING_QUERY,
      source: "sources",
    });
    assert.equal(presentation.kind, "relevant_source_matches");
    assert.equal(presentation.sectionTitle, "Relevant source matches");
    assert.deepEqual(
      presentation.displayRows.map((row) => row.candidate_key),
      ["url:https://openalex.org/Wpolling"],
    );
    for (const row of irrelevantLocals) {
      assert.equal(isRelevantSourceMatch(row, POLLING_QUERY), false);
      assert.ok(
        !presentation.displayRows.some((shown) => shown.candidate_key === row.candidate_key),
        `unrelated row ${row.candidate_key} must not appear under Relevant source matches`,
      );
    }
  });

  it("shows external catalogue matches only for credible rows", () => {
    const presentation = presentDiscoverResultQuality({
      rows: [
        {
          title: "Yahoo Finance home",
          description: "Quotes",
          candidate_key: "url:https://yahoo.example",
          relevance_score: 0.05,
        },
        {
          title: "US polling tracker",
          description: "Polling averages",
          candidate_key: "url:https://polls.example",
          relevance_score: 0.9,
        },
      ],
      query: POLLING_QUERY,
      source: "external_catalogues",
    });
    assert.equal(presentation.kind, "external_catalogue_matches");
    assert.equal(presentation.sectionTitle, "External catalogue matches");
    assert.deepEqual(
      presentation.displayRows.map((row) => row.candidate_key),
      ["url:https://polls.example"],
    );
  });

  it("uses an honest empty/next-action state when external rows are all weak", () => {
    const presentation = presentDiscoverResultQuality({
      rows: [
        {
          title: "SEC EDGAR",
          description: "Filings",
          candidate_key: "url:https://sec.example",
          relevance_score: 0.08,
        },
      ],
      query: POLLING_QUERY,
      source: "external_catalogues",
      externalSearchActive: true,
    });
    assert.equal(presentation.kind, "empty");
    assert.equal(presentation.displayRows.length, 0);
    assert.match(presentation.emptyMessage, /no credible external/i);
    assert.equal(presentation.nextAction, "refine_or_lab_routes");
  });

  it("preserves candidate identity fields on displayed rows", () => {
    const row = {
      title: "US polling data commons",
      candidate_key: "source:upc:polls",
      source_id: "upc",
      connector_id: "upc_connector",
    };
    const presentation = presentDiscoverResultQuality({
      rows: [row],
      query: POLLING_QUERY,
      source: "sources",
    });
    assert.equal(presentation.displayRows[0].candidate_key, "source:upc:polls");
    assert.equal(presentation.displayRows[0].source_id, "upc");
    assert.equal(presentation.displayRows[0].connector_id, "upc_connector");
  });
});
