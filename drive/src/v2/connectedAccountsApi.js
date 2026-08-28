import { fetchJson } from "./api.js";
import { deskHeaders } from "./deskSession.js";

export function listConnectedAccounts() {
  return fetchJson("/library/accounts");
}

export function startConnectedAccountOauth(provider, accessMode = "read") {
  return fetchJson("/library/accounts/oauth/start", {
    method: "POST",
    headers: deskHeaders(),
    body: JSON.stringify({
      provider: String(provider || "").trim(),
      access_mode: String(accessMode || "read").trim(),
    }),
  });
}

export function completeConnectedAccountOauth(provider, state, code) {
  return fetchJson("/library/accounts/oauth/complete", {
    method: "POST",
    headers: deskHeaders(),
    body: JSON.stringify({
      provider: String(provider || "").trim(),
      state: String(state || "").trim(),
      code: String(code || "").trim(),
    }),
  });
}

export function verifyConnectedAccount(accountId) {
  return fetchJson(`/library/accounts/${encodeURIComponent(accountId)}/verify`, {
    method: "POST",
    headers: deskHeaders(),
    body: JSON.stringify({}),
  });
}

export function disconnectConnectedAccount(accountId) {
  return fetchJson(`/library/accounts/${encodeURIComponent(accountId)}/disconnect`, {
    method: "POST",
    headers: deskHeaders(),
    body: JSON.stringify({}),
  });
}
