import test from "node:test";
import assert from "node:assert/strict";
import { friendlyAssistantReply } from "./askFailure.js";

test("a provider quota failure reads as plain capacity, without request ids", () => {
  const raw = "Composer could not complete that turn (connection or tool error). Detail: Session error: You have exceeded your monthly quota (Request ID: A5CC:149C2B)";
  const out = friendlyAssistantReply(raw);
  assert.match(out, /used up its provider's capacity/);
  assert.doesNotMatch(out, /Request ID|Session error|connection or tool error/);
});

test("other composer failures read as a retryable failure", () => {
  assert.match(friendlyAssistantReply("Composer could not complete that turn (connection or tool error)."), /couldn't complete this answer/);
});

test("ordinary answers pass through unchanged", () => {
  assert.equal(friendlyAssistantReply("The CRSP daily file covers 1925–2024."), "The CRSP daily file covers 1925–2024.");
});
