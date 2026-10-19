import test from "node:test";
import assert from "node:assert/strict";

import { groupBands, intersectionBands, intersectionCaption } from "./coverageBands.js";

const spine = () => intersectionBands({
  leftTotal: 635, rightTotal: 570, both: 50,
  leftLabel: "idn_fry", rightLabel: "refinitiv_spine",
});

test("the three regions are disjoint and cover the union", () => {
  const bands = spine();
  assert.deepEqual(bands.bands.map((b) => b.count), [585, 50, 520]);
  assert.equal(bands.union, 1155);
});

test("percentages are of the union, so they lay out directly", () => {
  const total = spine().bands.reduce((sum, band) => sum + band.percent, 0);
  assert.ok(Math.abs(total - 100) < 0.001, `expected 100, got ${total}`);
});

test("reach is reported for both sides, not only the left", () => {
  const bands = spine();
  assert.equal(bands.leftReach, 7.874);
  assert.equal(bands.rightReach, 8.772);
});

test("the caption says the thing the bar could not", () => {
  assert.match(intersectionCaption(spine()), /520 on the right match nothing here/);
});

test("a join with nothing in common says so plainly", () => {
  const bands = intersectionBands({ leftTotal: 10, rightTotal: 5, both: 0 });
  assert.equal(intersectionCaption(bands), "no value in common — this join reaches nothing");
});

test("a tiny overlap stays visible rather than rounding to nothing", () => {
  const bands = intersectionBands({ leftTotal: 100000, rightTotal: 100000, both: 1 });
  const both = bands.bands.find((b) => b.id === "both");
  assert.ok(both.percent >= 2, `expected a visible band, got ${both.percent}`);
});

test("a region with no members takes no width", () => {
  const bands = intersectionBands({ leftTotal: 10, rightTotal: 10, both: 10 });
  assert.equal(bands.bands.find((b) => b.id === "leftOnly").percent, 0);
  assert.equal(bands.bands.find((b) => b.id === "both").percent, 100);
});

test("both cannot exceed either side", () => {
  const bands = intersectionBands({ leftTotal: 5, rightTotal: 3, both: 99 });
  assert.equal(bands.bands.find((b) => b.id === "both").count, 3);
});

test("group segments are disjoint and sum to the column count", () => {
  const bands = groupBands([
    { id: "inUse", label: "in use", count: 3 },
    { id: "lookahead", label: "tell you the future", count: 9 },
    { id: "clean", label: "unremarkable", count: 23 },
  ]);
  assert.equal(bands.total, 35);
  assert.deepEqual(bands.segments.map((s) => s.count), [3, 9, 23]);
});

test("an empty group is dropped rather than drawn at zero width", () => {
  const bands = groupBands([
    { id: "inUse", label: "in use", count: 3 },
    { id: "sparse", label: "mostly blank", count: 0 },
  ]);
  assert.deepEqual(bands.segments.map((s) => s.id), ["inUse"]);
});

test("no groups is not an error", () => {
  assert.deepEqual(groupBands(null).segments, []);
  assert.equal(groupBands([]).total, 0);
});
