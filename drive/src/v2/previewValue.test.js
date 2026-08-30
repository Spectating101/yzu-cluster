import test from "node:test";
import assert from "node:assert/strict";
import { formatPreviewValue, fullPreviewValue, isStructuredPreviewValue } from "./previewValue.js";

test("nested preview values never leak JavaScript object coercion", () => {
  const value = { route: "stablecoin", stats: { rows: 139 }, tags: ["held", "query-ready"] };
  const rendered = formatPreviewValue(value);
  assert.equal(isStructuredPreviewValue(value), true);
  assert.match(rendered, /^\{"route":"stablecoin"/);
  assert.doesNotMatch(rendered, /\[object Object\]/);
  assert.match(fullPreviewValue(value), /"rows": 139/);
});

test("preview values preserve primitives and missing values", () => {
  assert.equal(formatPreviewValue(null), "—");
  assert.equal(formatPreviewValue(false), "false");
  assert.equal(formatPreviewValue(0), "0");
  assert.equal(formatPreviewValue("research"), "research");
});

test("large structured values are bounded in the table cell", () => {
  const rendered = formatPreviewValue({ payload: "x".repeat(500) }, 40);
  assert.equal(rendered.length, 40);
  assert.match(rendered, /…$/);
});
