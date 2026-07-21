/**
 * deskSession header contract — lowercase normalized names, value survival,
 * dual X-Desk-Token + Authorization Bearer when a browser token is present.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  clearDeskToken,
  deskFetchInit,
  deskHeaders,
  saveDeskToken,
} from "./deskSession.js";

function withFakeSessionStorage(run) {
  const store = new Map();
  const fake = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
  const prev = globalThis.sessionStorage;
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: fake,
  });
  try {
    return run();
  } finally {
    if (prev === undefined) {
      delete globalThis.sessionStorage;
    } else {
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: prev,
      });
    }
  }
}

test("deskHeaders uses lowercase keys and default content-type", () => {
  withFakeSessionStorage(() => {
    clearDeskToken();
    const headers = deskHeaders({ "X-Custom-Probe": "keep-me" });
    assert.equal(headers["content-type"], "application/json");
    assert.equal(headers["x-custom-probe"], "keep-me");
    assert.equal(headers["X-Custom-Probe"], undefined);
    assert.equal(headers["x-desk-token"], undefined);
    assert.equal(headers.authorization, undefined);
  });
});

test("deskHeaders flattens Headers instances and preserves arbitrary values", () => {
  withFakeSessionStorage(() => {
    clearDeskToken();
    const extra = new Headers();
    extra.set("X-Lab-Route", "vault");
    extra.append("Accept-Language", "en-US");
    const headers = deskHeaders(extra);
    assert.equal(headers["x-lab-route"], "vault");
    assert.equal(headers["accept-language"], "en-US");
    assert.equal(headers["content-type"], "application/json");
  });
});

test("deskHeaders flattens array tuples case-insensitively", () => {
  withFakeSessionStorage(() => {
    clearDeskToken();
    const headers = deskHeaders([
      ["X-Trace-Id", "abc-123"],
      ["x-trace-id", "winner"],
    ]);
    // Last write wins under normalized lowercase key.
    assert.equal(headers["x-trace-id"], "winner");
  });
});

test("deskHeaders dual-writes token as x-desk-token and authorization Bearer", () => {
  withFakeSessionStorage(() => {
    saveDeskToken("unit-test-token");
    const headers = deskHeaders();
    assert.equal(headers["x-desk-token"], "unit-test-token");
    assert.equal(headers.authorization, "Bearer unit-test-token");
    clearDeskToken();
  });
});

test("deskHeaders does not overwrite an existing authorization header", () => {
  withFakeSessionStorage(() => {
    saveDeskToken("unit-test-token");
    const headers = deskHeaders({ Authorization: "Bearer already-set" });
    assert.equal(headers.authorization, "Bearer already-set");
    assert.equal(headers["x-desk-token"], "unit-test-token");
    clearDeskToken();
  });
});

test("deskFetchInit merges credentials and normalized headers", () => {
  withFakeSessionStorage(() => {
    saveDeskToken("unit-test-token");
    const init = deskFetchInit({
      method: "GET",
      headers: new Headers([["X-Custom", "1"]]),
    });
    assert.equal(init.credentials, "include");
    assert.equal(init.method, "GET");
    assert.equal(init.headers["x-custom"], "1");
    assert.equal(init.headers["x-desk-token"], "unit-test-token");
    assert.equal(init.headers.authorization, "Bearer unit-test-token");
    clearDeskToken();
  });
});
