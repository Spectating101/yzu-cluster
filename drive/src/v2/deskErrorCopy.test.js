import test from "node:test";
import assert from "node:assert/strict";
import { deskErrorCopy, isSessionError } from "./deskErrorCopy.js";

// The exact string the live desk rendered as body copy on 2026-08-20.
const RAW_401 = "Desk access token required (set Authorization: Bearer or X-Desk-Token)";

test("the auth message never reaches the reader", () => {
  const copy = deskErrorCopy(RAW_401, { surface: "your constructions" });
  assert.equal(copy.headline, "This desk needs a session");
  assert.match(copy.body, /Sign in to load your constructions/);
  assert.doesNotMatch(copy.body, /Authorization|Bearer|X-Desk-Token|token/i);
  assert.doesNotMatch(copy.headline, /Bearer|X-Desk-Token/i);
});

test("the original is kept as detail, not discarded", () => {
  assert.equal(deskErrorCopy(RAW_401).detail, RAW_401);
});

test("a session problem is distinguished from a fault", () => {
  assert.equal(isSessionError(RAW_401), true);
  assert.equal(isSessionError("500 /library/synthesis/profiles"), false);
  assert.equal(isSessionError(""), false);
});

test("a server fault says it is the desk's fault, not the question's", () => {
  const copy = deskErrorCopy("500 /library/synthesis/profiles", { surface: "the method library" });
  assert.match(copy.body, /fault on the desk/);
  assert.doesNotMatch(copy.body, /500|\/library/);
});

test("a timeout and an unreachable desk read differently", () => {
  assert.match(deskErrorCopy("Request timed out after 6000ms: /x").headline, /did not answer in time/);
  assert.match(deskErrorCopy("Failed to fetch").headline, /unreachable/);
});

test("an unrecognised failure still avoids leaking the raw string into the body", () => {
  const copy = deskErrorCopy("ENOTAHTING weird/path?x=1", { surface: "this page" });
  assert.match(copy.headline, /did not load/);
  assert.doesNotMatch(copy.body, /ENOTAHTING|weird\/path/);
  assert.equal(copy.detail, "ENOTAHTING weird/path?x=1");
});

test("no error means nothing to render", () => {
  assert.equal(deskErrorCopy(""), null);
  assert.equal(deskErrorCopy(null), null);
  assert.equal(deskErrorCopy(undefined), null);
});
