import assert from "node:assert/strict";
import { test } from "node:test";
import { pinOrder } from "./stableOrder.js";

const key = (row) => row.id;

test("rows already shown keep their places when better-ranked rows arrive later", () => {
  const order = new Map();
  assert.deepEqual(pinOrder([{ id: "a" }, { id: "b" }], key, order).map(key), ["a", "b"]);
  const reranked = [{ id: "c" }, { id: "b" }, { id: "a" }, { id: "d" }];
  assert.deepEqual(pinOrder(reranked, key, order).map(key), ["a", "b", "c", "d"]);
});

test("a row that drops out and returns keeps its original slot", () => {
  const order = new Map();
  pinOrder([{ id: "a" }, { id: "b" }, { id: "c" }], key, order);
  assert.deepEqual(pinOrder([{ id: "c" }, { id: "a" }], key, order).map(key), ["a", "c"]);
});
