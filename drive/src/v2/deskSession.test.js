import test from "node:test";
import assert from "node:assert/strict";
import {
  chatSessionStorageKey,
  clearChatSessionId,
  clearDeskToken,
  deskFetchInit,
  deskHeaders,
  deskSessionBootstrapped,
  hasDeskToken,
  loadChatSessionId,
  markDeskSessionBootstrapped,
  saveChatSessionId,
  saveDeskToken,
} from "./deskSession.js";

function installMemorySessionStorage() {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(String(k), String(v));
    },
    removeItem: (k) => {
      store.delete(String(k));
    },
  };
}

function installMemoryLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(String(k), String(v));
    },
    removeItem: (k) => {
      store.delete(String(k));
    },
  };
}

installMemorySessionStorage();
installMemoryLocalStorage();

test("saveDeskToken persists for deskHeaders without exposing empty tokens", () => {
  clearDeskToken();
  assert.equal(hasDeskToken(), false);
  assert.equal(deskHeaders()["x-desk-token"], undefined);
  saveDeskToken("unit-test-token");
  assert.equal(hasDeskToken(), true);
  assert.equal(deskHeaders()["x-desk-token"], "unit-test-token");
  clearDeskToken();
  assert.equal(hasDeskToken(), false);
});

test("deskFetchInit always includes credentials for cookie sessions", () => {
  const init = deskFetchInit({ method: "POST", body: "{}" });
  assert.equal(init.credentials, "include");
  assert.equal(init.headers["content-type"], "application/json");
});

test("markDeskSessionBootstrapped tracks cookie bootstrap state", () => {
  markDeskSessionBootstrapped(false);
  assert.equal(deskSessionBootstrapped(), false);
  markDeskSessionBootstrapped(true);
  assert.equal(deskSessionBootstrapped(), true);
  markDeskSessionBootstrapped(false);
  assert.equal(deskSessionBootstrapped(), false);
});

test("Ask chat sessions stay isolated by research context", () => {
  clearChatSessionId("discover:jkse");
  clearChatSessionId("discover:forest-fire");
  saveChatSessionId("session-jkse", "discover:jkse");
  saveChatSessionId("session-fire", "discover:forest-fire");

  assert.equal(loadChatSessionId("discover:jkse"), "session-jkse");
  assert.equal(loadChatSessionId("discover:forest-fire"), "session-fire");
  assert.notEqual(chatSessionStorageKey("discover:jkse"), chatSessionStorageKey("discover:forest-fire"));
});

test("clearing one Ask context never clears another", () => {
  saveChatSessionId("session-a", "dataset:a");
  saveChatSessionId("session-b", "dataset:b");
  clearChatSessionId("dataset:a");

  assert.equal(loadChatSessionId("dataset:a"), "");
  assert.equal(loadChatSessionId("dataset:b"), "session-b");
});

test("legacy unscoped chat storage remains available only to unscoped callers", () => {
  saveChatSessionId("legacy-session");
  assert.equal(loadChatSessionId(), "legacy-session");
  assert.equal(loadChatSessionId("discover:new-question"), "");
});
