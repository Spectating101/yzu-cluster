import assert from "node:assert/strict";
import { test } from "node:test";
import { orderDiscoverResults } from "./browseMeta.js";

const source = (id, extra) => ({ source_id: id, title: id, kind: "source", collect_via: "queue", ...extra });

test("peers follow the backend rank score when it is present", () => {
  const rows = [
    source("twse_official", { query_relevance: 4, rank_score: 2.5 }),
    source("lseg_edp", { query_relevance: 2, rank_score: 4.5 }),
    source("binance_klines", { query_relevance: 2, rank_score: 0 }),
  ];
  assert.deepEqual(orderDiscoverResults(rows, new Set()).map((r) => r.source_id), ["lseg_edp", "twse_official", "binance_klines"]);
});

test("query relevance still orders peers without a rank score", () => {
  const rows = [source("a", { query_relevance: 1 }), source("b", { query_relevance: 3 })];
  assert.deepEqual(orderDiscoverResults(rows, new Set()).map((r) => r.source_id), ["b", "a"]);
});
