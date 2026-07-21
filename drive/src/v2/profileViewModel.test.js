import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeskRead,
  buildLab,
  buildMemoryCards,
  buildWorks,
  workTitleFromHighlight,
} from "./profileViewModel.js";

const SAMPLE = {
  name_en: "Kong, De-Rong",
  discipline: "Finance",
  title: "Assistant Professor",
  email: "drkong@saturn.yzu.edu.tw",
  paper_count_parsed: 18,
  specialties: ["Asset Pricing", "FinTech"],
  research_tracks: [
    { id: "t1", title: "Token taxonomy — on-chain and off-chain data", phase: "active_grant", weight: 3 },
    { id: "t2", title: "Taiwan equity misconduct", weight: 1 },
  ],
  method_tags: ["panel_data", "on_chain"],
  publication_highlights: [
    "Kong (2020). Alternative investments in the Fintech era. Journal of Foo.",
    "Kong (2021). NFT liquidity. SSRN 123.",
    "Kong (2022). Third paper. Journal of Bar.",
    "Kong (2023). Fourth paper. Journal of Baz.",
  ],
  lab_fintech_stack: [
    { id: "opensea", label: "OpenSea NFT metadata graph", route: "vault" },
    { id: "coingecko", label: "CoinGecko market panels", route: "bigquery" },
  ],
  procurement_recommendations: [
    { dataset: "TWSE listed firm daily prices", search_query: "TWSE daily", source_route: "web" },
    { dataset: "OpenSea NFT metadata graph", source_route: "vault" },
  ],
};

test("Memory builds compact focus/current/also/methods cards", () => {
  const cards = buildMemoryCards(SAMPLE);
  assert.equal(cards[0].id, "focus");
  assert.match(cards[0].text, /Asset Pricing/);
  assert.equal(cards.some((c) => c.id === "current"), true);
  assert.equal(cards.some((c) => c.id === "methods"), true);
});

test("Works are primary and capped at six indexed titles", () => {
  const works = buildWorks(SAMPLE);
  assert.equal(works.paperCount, 18);
  assert.equal(works.items.length, 4);
  assert.match(works.items[0].title, /Alternative investments/i);
  assert.ok(works.items.every((w) => w.title && w.raw && w.type && w.relationship));
});

test("Lab separates linked evidence from gaps and skips already-linked recs", () => {
  const lab = buildLab(SAMPLE);
  assert.equal(lab.linked.length, 2);
  assert.equal(lab.linked[0].routeLabel, "Vaulted");
  assert.ok(lab.suggested.every((s) => !/opensea/i.test(s.label)));
  assert.ok(lab.suggested.some((s) => /TWSE/i.test(s.label)));
});

test("Desk read never invents empty Loading state when profile exists", () => {
  const read = buildDeskRead(SAMPLE);
  assert.match(read.scholar, /Finance faculty/i);
  assert.ok(read.strengths.length >= 1);
  assert.ok(read.desk);
  assert.equal(read.previewing, false);
});

test("workTitleFromHighlight strips citation noise", () => {
  assert.match(
    workTitleFromHighlight("Kong (2020). Alternative investments in the Fintech era. Journal of Foo."),
    /Alternative investments/i,
  );
});
