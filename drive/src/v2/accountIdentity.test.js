import test from "node:test";
import assert from "node:assert/strict";
import { bindDeskIdentity, deskIdentityGeneration, assertDeskIdentity, saveChatSessionId, loadChatSessionId, saveUserEmail, loadUserEmail, saveDeskToken, hasDeskToken } from "./deskSession.js";
import { loadSettings, saveSettings } from "./settingsStore.js";
import { touchRecent, loadRecentIds } from "./recent.js";

function memoryStorage() {
  const data = new Map();
  return { get length() { return data.size; }, key: (i) => [...data.keys()][i],
    getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();

test("two researchers recover their own pointers, preferences, recent items and email", () => {
  bindDeskIdentity({ id: "alice", role: "member" });
  saveChatSessionId("alice-session", "general"); saveUserEmail("alice@example.test");
  saveSettings({ onSelect: "ask" }); touchRecent("alice-data");
  bindDeskIdentity({ id: "bob", role: "member" });
  assert.equal(loadChatSessionId("general"), ""); assert.equal(loadUserEmail(), "");
  assert.equal(loadSettings().onSelect, "detail"); assert.deepEqual(loadRecentIds(), []);
  saveChatSessionId("bob-session", "general"); saveUserEmail("bob@example.test");
  bindDeskIdentity({ id: "alice", role: "member" });
  assert.equal(loadChatSessionId("general"), "alice-session"); assert.equal(loadUserEmail(), "alice@example.test");
  assert.equal(loadSettings().onSelect, "ask"); assert.deepEqual(loadRecentIds(), ["alice-data"]);
});

test("an identity change clears fallback credentials and invalidates earlier responses", () => {
  const generation = deskIdentityGeneration();
  saveDeskToken("fixture-only");
  bindDeskIdentity({ id: "guest-new", role: "public_guest" });
  assert.equal(hasDeskToken(), false);
  assert.throws(() => assertDeskIdentity(generation), /account changed/);
  assert.equal(loadChatSessionId("general"), "");
});

test("new invited users never inherit legacy operator identity or conversation", () => {
  localStorage.setItem("procure_user_email", "pilot@example.test");
  localStorage.setItem("rd_v2_chat_session", "operator-session");
  localStorage.setItem("rd_v2_chat_session:context:general", "operator-context");
  bindDeskIdentity({ id: "new-researcher", role: "public_member" });
  assert.equal(loadUserEmail(), ""); assert.equal(loadChatSessionId("general"), "");
  assert.equal(localStorage.getItem("rd_v2_chat_session"), null);
});
