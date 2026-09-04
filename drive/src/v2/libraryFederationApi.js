import { listConnectedAccounts } from "./connectedAccountsApi.js";
import { fetchJson } from "./api.js";
import { libraryLocationsFromAccountDocument } from "./libraryFederationRuntime.js";
import { normalizeProviderDirectoryPage, providerDirectoryRequest } from "./libraryLocations.js";

async function resolvedAccountId(providerId, explicitAccountId = "") {
  const supplied = String(explicitAccountId || "").trim();
  if (supplied) return supplied;
  const document = await listConnectedAccounts();
  const provider = String(providerId || "").trim().toLowerCase();
  const location = libraryLocationsFromAccountDocument(document).find((item) => item.id === provider);
  if (!location?.directoryBrowseAvailable || !location?.accountId) {
    throw new Error(`${location?.label || provider || "Connected storage"} is not ready for folder browsing`);
  }
  return location.accountId;
}

/**
 * Provider-neutral directory endpoint. The private API owns OAuth credentials,
 * provider API details, permission checks, and provider cursors. Every request
 * is bound to one explicit connected-account identity, including continuation
 * pages, so multiple accounts for the same provider cannot be conflated.
 */
export async function listLibraryProviderDirectory({
  providerId,
  accountId = "",
  parentId = "",
  cursor = "",
  limit,
} = {}) {
  const resolvedAccount = await resolvedAccountId(providerId, accountId);
  const request = providerDirectoryRequest({ providerId, accountId: resolvedAccount, parentId, cursor, limit });
  const params = new URLSearchParams();
  params.set("provider", request.provider);
  params.set("account_id", request.account_id);
  if (request.parent_id) params.set("parent_id", request.parent_id);
  if (request.cursor) params.set("cursor", request.cursor);
  params.set("limit", String(request.limit));
  const payload = await fetchJson(`/library/folders?${params.toString()}`, { timeoutMs: 20_000 });
  const page = normalizeProviderDirectoryPage(payload);
  if (page.accountId && page.accountId !== request.account_id) {
    throw new Error("Connected-storage directory response changed account identity");
  }
  return page;
}
