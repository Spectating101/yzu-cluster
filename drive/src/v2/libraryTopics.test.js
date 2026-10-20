import assert from "node:assert/strict";
import { test } from "node:test";
import { datasetTopic, topicCounts } from "./libraryTopics.js";
import { buildProfessorVaultTree } from "./professorVaultTree.js";

test("datasets fall into research topics, not storage shelves", () => {
  assert.equal(datasetTopic({ title: "County unemployment rate, NY/Miami-Dade 2019-2024", source_id: "bls_laus_county" }).label, "Economy & labour");
  assert.equal(datasetTopic({ title: "Mauna Loa Monthly CO₂ Record" }).label, "Climate & environment");
  assert.equal(datasetTopic({ title: "USGS Earthquake Catalog Data", shelf_hint: "news_events" }).label, "Science & health");
  assert.equal(datasetTopic({ title: "CoinGecko crypto spot prices", shelf_hint: "crypto_onchain" }).label, "Crypto & on-chain");
  assert.equal(datasetTopic({ title: "Weekly ticker panel", shelf_hint: "asia_stocks" }).label, "Asian markets");
  assert.equal(datasetTopic({ title: "Cross-asset country-week research panel", shelf_hint: "analysis_ready" }).label, "Research panels");
  assert.equal(datasetTopic({ title: "Untitled file", shelf_hint: "project_downloads" }).label, "Your project downloads");
  assert.equal(datasetTopic({ title: "Something unclassified" }).label, "Other data");
});

test("the Library tree groups by topic and keeps partitions as folders", () => {
  const partitions = [{ partition_id: "acquired.procured", professor_label: "Procured one-offs" }];
  const datasets = [
    { dataset_id: "bls", title: "County unemployment rate", source_id: "bls_laus_county", partition_id: "acquired.procured" },
    { dataset_id: "co2", title: "Mauna Loa Monthly CO2 Record", partition_id: "acquired.procured" },
    { dataset_id: "loose", title: "Something unclassified" },
  ];
  const { root } = buildProfessorVaultTree(datasets, partitions);
  assert.deepEqual(Object.values(root.children).map((shelf) => shelf.name).sort(), ["Climate & environment", "Economy & labour", "Other data"]);
  const economy = root.children.economy;
  const folder = economy.children["economy/acquired.procured"];
  assert.equal(folder.name, "Procured one-offs");
  assert.equal(folder.children.bls.pathLabel, "Economy & labour › Procured one-offs");
  assert.equal(root.children.other.children["other/unfiled"].name, "Other Library data");
});

test("curated shelves are kept; shelves derived from storage prefixes become topics", () => {
  const partitions = [{ partition_id: "acquired.procured", professor_label: "Procured one-offs" }];
  const datasets = [{ dataset_id: "co2", title: "Mauna Loa Monthly CO2 Record", partition_id: "acquired.procured" }];
  const derived = buildProfessorVaultTree(datasets, partitions, [{ id: "acquired", label: "Acquired", partition_ids: ["acquired.procured"], derived_from: "domain" }]);
  assert.deepEqual(Object.values(derived.root.children).map((shelf) => shelf.name), ["Climate & environment"]);
  const curated = buildProfessorVaultTree(datasets, partitions, [{ id: "panels", label: "Research panels", partition_ids: ["acquired.procured"] }]);
  assert.ok(Object.values(curated.root.children).some((shelf) => shelf.name === "Research panels"));
});

test("topic counts rank the busiest topics and leave out the catch-all ones", () => {
  const rows = [
    { title: "County unemployment rate", source_id: "bls_laus_county" },
    { title: "Consumer price index inflation", tags: ["inflation"], source_id: "bls_cpi" },
    { title: "Bitcoin daily prices", tags: ["bitcoin"] },
    { title: "Unclassifiable thing" },
    { title: "Another unclassifiable thing", shelf_hint: "project_downloads" },
  ];
  const counts = topicCounts(rows);
  assert.ok(counts.length >= 1 && counts.length <= 6);
  assert.deepEqual(counts.map((entry) => entry.count), [...counts.map((entry) => entry.count)].sort((a, b) => b - a));
  assert.ok(!counts.some((entry) => ["other", "downloads", "lookups", "catalogues"].includes(entry.id)));
  assert.equal(counts.reduce((sum, entry) => sum + entry.count, 0), 3);
  assert.equal(topicCounts(rows, 1).length, 1);
  assert.deepEqual(topicCounts([]), []);
});
