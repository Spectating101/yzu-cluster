import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { connectorReturnPath, rememberConnectorReturn } from "./connectorReturn.js";

describe("connector sign-in return", () => {
  let savedWindow;
  let store;
  beforeEach(() => {
    savedWindow = globalThis.window;
    store = new Map();
    globalThis.window = { location: { search: "" }, sessionStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key),
    } };
  });
  afterEach(() => { globalThis.window = savedWindow; });
  it("retains the consent ticket after routing clears the query and consumes it once", () => {
    window.location.search = `?connect_request=${"a".repeat(43)}`;
    rememberConnectorReturn();
    window.location.search = "?tab=settings";
    assert.equal(connectorReturnPath({ consume: true }), `/oauth/consent?request_id=${"a".repeat(43)}`);
    assert.equal(connectorReturnPath(), null);
  });
  it("rejects external URLs, paths, short values and injected parameters", () => {
    for (const value of ["https://other.test", "//other.test", "/oauth/consent", "short", "a".repeat(43) + "&target=other"]) {
      window.location.search = `?connect_request=${encodeURIComponent(value)}`;
      rememberConnectorReturn();
      assert.equal(connectorReturnPath(), null);
    }
  });
  it("expires pending returns and handles malformed or inaccessible browser storage", () => {
    store.set("rd.connector-return", JSON.stringify({ ticket: "a".repeat(43), expires: Date.now() - 1 }));
    assert.equal(connectorReturnPath(), null);
    store.set("rd.connector-return", "not json");
    assert.equal(connectorReturnPath(), null);
    window.sessionStorage.getItem = () => { throw new Error("blocked"); };
    assert.equal(connectorReturnPath(), null);
  });
});
