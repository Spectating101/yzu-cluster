import test from "node:test";
import assert from "node:assert/strict";
import { featuredRows, matchedRows, libraryLenses, lensNote, profileFocus, discoverExamples, NEUTRAL_EXAMPLES, FOCUS_LIMIT } from "./libraryFocus.js";

const row = (id, extra = {}) => ({ dataset_id: id, name: id, grain: "day", ...extra });

const HOLDINGS = [
  row("ff", { name: "Fama-French factors", featured_rank: 3, tags: ["asset pricing", "factors"] }),
  row("crypto", { name: "Major cryptocurrency daily prices", featured_rank: 4, tags: ["crypto", "prices"] }),
  row("crsp", { name: "CRSP daily file", featured_rank: 1, licensed: true, rows_available: false }),
  row("crsp_open", { name: "CRSP daily file for members", featured_rank: 2, licensed: true, rows_available: true }),
  row("gdp", { name: "World Bank GDP", tags: ["macro", "gdp"] }),
  row("coin_a", { name: "Etherscan stablecoin catalog A", grain: "catalog_harvest", tags: ["stablecoin"] }),
  row("coin_b", { name: "Etherscan stablecoin catalog B", grain: "catalog_harvest", tags: ["stablecoin"] }),
  row("coin_c", { name: "Etherscan stablecoin catalog C", grain: "catalog_harvest", tags: ["stablecoin"] }),
  row("coin_d", { name: "Etherscan stablecoin catalog D", grain: "catalog_harvest", tags: ["stablecoin"] }),
  row("depeg", { name: "Stablecoin de-peg weeks", grain: "week", tags: ["stablecoin", "depeg"] }),
  row("temp", { name: "Global temperature anomalies", tags: ["climate"] }),
];

const document = (profile = {}, memories = [], settings = {}) => ({
  principal: { email: "a@b.c" },
  profile,
  memory: { memories: memories.map((value) => ({ value })), settings },
});

test("featured lists follow the editorial rank and leave out rows the viewer cannot read", () => {
  assert.deepEqual(featuredRows(HOLDINGS).map((r) => r.dataset_id), ["crsp_open", "ff", "crypto"]);
});

test("featured is empty when no dataset carries a rank, so the page falls back to the full list", () => {
  assert.deepEqual(featuredRows(HOLDINGS.map(({ featured_rank, ...rest }) => rest)), []);
  assert.deepEqual(libraryLenses(HOLDINGS.map(({ featured_rank, ...rest }) => rest), profileFocus(undefined)), []);
});

test("featured is capped", () => {
  const many = Array.from({ length: 30 }, (_, i) => row(`d${i}`, { featured_rank: i + 1 }));
  assert.equal(featuredRows(many).length, FOCUS_LIMIT);
  assert.equal(featuredRows(many)[0].dataset_id, "d0");
});

test("a signed-out or empty profile has no terms", () => {
  assert.deepEqual(profileFocus(undefined), { signedIn: false, terms: [], label: "", topics: [] });
  assert.deepEqual(profileFocus({}), { signedIn: false, terms: [], label: "", topics: [] });
  const empty = profileFocus(document());
  assert.equal(empty.signedIn, true);
  assert.deepEqual(empty.terms, []);
});

test("profile terms come from project, topics, methods and learned memory, minus filler words", () => {
  const focus = profileFocus(document(
    { current_project: "Stablecoin de-pegging", research_topics: ["event studies"], methods: ["panel regression"] },
    ["Tether redemption"],
  ));
  for (const term of ["stablecoin", "pegging", "event", "panel", "regression", "tether", "redemption"]) {
    assert.ok(focus.terms.includes(term), term);
  }
  assert.ok(!focus.terms.includes("studies") && !focus.terms.includes("the"));
  assert.equal(focus.label, "event studies, Stablecoin de-pegging");
});

test("learned memory is ignored when the member turned it off", () => {
  const focus = profileFocus(document({ research_topics: ["climate"] }, ["secret topic"], { use_memory: false }));
  assert.deepEqual(focus.terms, ["climate"]);
});

test("matching puts the research the member named first and skips unrelated rows", () => {
  const ids = matchedRows(HOLDINGS, ["stablecoin", "depeg"]).map((r) => r.dataset_id);
  assert.equal(ids[0], "depeg");
  assert.ok(!ids.includes("gdp") && !ids.includes("temp"));
});

test("thin catalogue crawls cannot flood the list", () => {
  const ids = matchedRows(HOLDINGS, ["stablecoin"]).map((r) => r.dataset_id);
  assert.equal(ids.filter((id) => id.startsWith("coin_")).length, 3);
  assert.equal(ids[0], "depeg");
});

test("matching never returns a row the viewer cannot read, and reads licensed rows for members", () => {
  assert.ok(!matchedRows(HOLDINGS, ["crsp"]).some((r) => r.dataset_id === "crsp"));
  assert.deepEqual(matchedRows(HOLDINGS, ["crsp"]).map((r) => r.dataset_id), ["crsp_open"]);
});

test("a prefix matches plurals but a term inside another word does not", () => {
  const rows = [row("a", { name: "Stablecoins weekly" }), row("b", { name: "Nonstablecoin things" })];
  assert.deepEqual(matchedRows(rows, ["stablecoin"]).map((r) => r.dataset_id), ["a"]);
});

test("a term that appears everywhere counts for less than a rare one", () => {
  const rows = [
    row("rare", { name: "alpha", tags: ["sentiment"] }),
    row("b", { name: "market flows" }),
    row("c", { name: "market prices" }),
    row("d", { name: "market stuff" }),
  ];
  assert.equal(matchedRows(rows, ["market", "sentiment"])[0].dataset_id, "rare");
});

test("lenses list the personal view first, then featured, and nothing when neither exists", () => {
  const focus = profileFocus(document({ research_topics: ["stablecoin"] }));
  assert.deepEqual(libraryLenses(HOLDINGS, focus).map((l) => l.id), ["for_you", "featured"]);
  assert.deepEqual(libraryLenses(HOLDINGS, profileFocus(undefined)).map((l) => l.id), ["featured"]);
  assert.deepEqual(libraryLenses([row("x")], profileFocus(undefined)), []);
});

test("the note explains the view and nudges a member who has no focus yet", () => {
  assert.match(lensNote("for_you", { label: "stablecoin" }), /Matched to your research: stablecoin/);
  assert.equal(lensNote("featured", profileFocus(undefined)), "");
  assert.match(lensNote("featured", profileFocus(document())), /Add your research focus in Profile/);
  assert.equal(lensNote("all", {}), "");
});

test("Discover suggests neutral searches until a member has named a topic", () => {
  assert.deepEqual(discoverExamples(profileFocus(undefined)), NEUTRAL_EXAMPLES);
  assert.deepEqual(discoverExamples(profileFocus(document())), NEUTRAL_EXAMPLES);
  assert.deepEqual(discoverExamples(profileFocus(document({ research_topics: ["stablecoin de-pegging"] }))), {
    keyword: "stablecoin de-pegging",
    question: "What data can I use to study stablecoin de-pegging?",
  });
});
