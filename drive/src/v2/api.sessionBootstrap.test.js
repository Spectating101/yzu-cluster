/**
 * Desk session bootstrap gate at the fetchJson boundary.
 * Run: node --test drive/src/v2/api.sessionBootstrap.test.js
 */
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { fetchJson } from "./api.js";
import { markDeskSessionBootstrapped } from "./deskSession.js";

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
    clear: () => store.clear(),
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

installMemorySessionStorage();

let fetchCalls;

beforeEach(() => {
  sessionStorage.clear();
  markDeskSessionBootstrapped(false);
  fetchCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).replace(/^\/api/, "");
    fetchCalls.push({ path, method: (init.method || "GET").toUpperCase(), init });
    if (path.startsWith("/library/desk/session")) {
      return jsonResponse({ ok: true, authorized: true });
    }
    if (path.startsWith("/library/")) {
      return jsonResponse({ ok: true, path });
    }
    return jsonResponse({ ok: true, path });
  };
});

afterEach(() => {
  delete globalThis.fetch;
});

test("concurrent protected /library calls share one session bootstrap", async () => {
  const [a, b, c] = await Promise.all([
    fetchJson("/library/overview"),
    fetchJson("/library/jobs"),
    fetchJson("/library/partitions"),
  ]);

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(c.ok, true);

  const sessionPosts = fetchCalls.filter(
    (call) => call.path.startsWith("/library/desk/session") && call.method === "POST",
  );
  assert.equal(sessionPosts.length, 1, "expected a single deduplicated session bootstrap");

  const protectedCalls = fetchCalls.filter(
    (call) => call.path.startsWith("/library/") && !call.path.startsWith("/library/desk/session"),
  );
  assert.equal(protectedCalls.length, 3);
  assert.ok(
    fetchCalls.findIndex((call) => call.path.startsWith("/library/desk/session")) <
      fetchCalls.findIndex((call) => call.path === "/library/overview"),
    "session bootstrap must complete before protected routes",
  );
});

test("session route bypasses bootstrap guard (no recursion)", async () => {
  const out = await fetchJson("/library/desk/session", {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert.equal(out.ok, true);

  const sessionPosts = fetchCalls.filter((call) => call.path.startsWith("/library/desk/session"));
  assert.equal(sessionPosts.length, 1);
  assert.equal(fetchCalls.length, 1);
});

test("bootstrap failure fails protected calls explicitly", async () => {
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).replace(/^\/api/, "");
    fetchCalls.push({ path, method: (init.method || "GET").toUpperCase(), init });
    if (path.startsWith("/library/desk/session")) {
      return jsonResponse({ message: "unauthorized" }, 401);
    }
    return jsonResponse({ ok: true, path });
  };

  await assert.rejects(() => fetchJson("/library/overview"), /unauthorized|401|session/i);
  assert.equal(
    fetchCalls.filter((call) => call.path === "/library/overview").length,
    0,
    "protected route must not fire after failed bootstrap",
  );
});

test("already-bootstrapped skips session POST", async () => {
  markDeskSessionBootstrapped(true);
  await fetchJson("/library/overview");
  assert.equal(
    fetchCalls.filter((call) => call.path.startsWith("/library/desk/session")).length,
    0,
  );
  assert.equal(fetchCalls.filter((call) => call.path === "/library/overview").length, 1);
});

test("non-library routes do not trigger session bootstrap", async () => {
  await fetchJson("/health");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].path, "/health");
});

test("abort signal is honored while waiting for bootstrap", async () => {
  let releaseSession;
  const sessionGate = new Promise((resolve) => {
    releaseSession = resolve;
  });

  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).replace(/^\/api/, "");
    fetchCalls.push({ path, method: (init.method || "GET").toUpperCase(), init });
    if (path.startsWith("/library/desk/session")) {
      await sessionGate;
      if (init.signal?.aborted) {
        const err = new Error("Aborted");
        err.name = "AbortError";
        throw err;
      }
      return jsonResponse({ ok: true, authorized: true });
    }
    return jsonResponse({ ok: true, path });
  };

  const controller = new AbortController();
  const pending = fetchJson("/library/overview", { signal: controller.signal });
  await Promise.resolve();
  await Promise.resolve();
  controller.abort();
  releaseSession();

  await assert.rejects(() => pending, (err) => {
    assert.equal(err.name, "AbortError");
    return true;
  });
});
